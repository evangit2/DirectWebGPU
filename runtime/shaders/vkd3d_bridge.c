/*
 * DirectWebGPU adapter for unmodified libvkd3d-shader plus the retained
 * WebGPU point-size patch. The adapter exposes a small, bounded ABI to JS.
 */
#include "vkd3d_shader.h"

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define ARRAY_SIZE(a) (sizeof(a) / sizeof((a)[0]))

static struct vkd3d_shader_code outputs[2];
static struct vkd3d_shader_scan_signature_info signatures[2];
static struct vkd3d_shader_scan_descriptor_info descriptors[2];
static char errors[2][4096];

static void copy_error(int stage, int result, const char *messages)
{
    snprintf(errors[stage], sizeof(errors[stage]),
            "vkd3d-shader result %d%s%s", result,
            messages && *messages ? ": " : "", messages && *messages ? messages : "");
}

void vkd3d_bridge_reset(void)
{
    unsigned int stage;

    for (stage = 0; stage < 2; ++stage)
    {
        vkd3d_shader_free_shader_code(&outputs[stage]);
        vkd3d_shader_free_scan_signature_info(&signatures[stage]);
        vkd3d_shader_free_scan_descriptor_info(&descriptors[stage]);
        memset(&outputs[stage], 0, sizeof(outputs[stage]));
        memset(&signatures[stage], 0, sizeof(signatures[stage]));
        memset(&descriptors[stage], 0, sizeof(descriptors[stage]));
        errors[stage][0] = 0;
    }
}

static int valid_input(int stage, const void *bytes, unsigned int length)
{
    uint32_t version;

    if (stage < 0 || stage > 1 || !bytes || length < 8 || length > 1024 * 1024 || length % 4)
        return 0;
    memcpy(&version, bytes, sizeof(version));
    if ((version >> 16) != (stage ? 0xffffu : 0xfffeu))
    {
        snprintf(errors[stage], sizeof(errors[stage]),
                "shader stage does not match bytecode version %#x", version);
        return 0;
    }
    return 1;
}

static int scan_shader(int stage, const void *bytes, unsigned int length)
{
    struct vkd3d_shader_compile_info info = {0};
    char *messages = NULL;
    int result;

    if (!valid_input(stage, bytes, length))
        return 0;
    signatures[stage].type = VKD3D_SHADER_STRUCTURE_TYPE_SCAN_SIGNATURE_INFO;
    descriptors[stage].type = VKD3D_SHADER_STRUCTURE_TYPE_SCAN_DESCRIPTOR_INFO;
    descriptors[stage].next = &signatures[stage];
    info.type = VKD3D_SHADER_STRUCTURE_TYPE_COMPILE_INFO;
    info.next = &descriptors[stage];
    info.source.code = bytes;
    info.source.size = length;
    info.source_type = VKD3D_SHADER_SOURCE_D3D_BYTECODE;
    info.target_type = VKD3D_SHADER_TARGET_SPIRV_BINARY;
    info.log_level = VKD3D_SHADER_LOG_WARNING;
    result = vkd3d_shader_scan(&info, &messages);
    if (result < 0)
    {
        copy_error(stage, result, messages);
        vkd3d_shader_free_messages(messages);
        return 0;
    }
    vkd3d_shader_free_messages(messages);
    return 1;
}

static int compile_shader(int stage, const void *bytes, unsigned int length,
        const struct vkd3d_shader_varying_map_info *varying_info)
{
    struct vkd3d_shader_resource_binding bindings[32];
    struct vkd3d_shader_d3dbc_source_info source_info = {0};
    struct vkd3d_shader_spirv_target_info target_info = {0};
    struct vkd3d_shader_interface_info interface_info = {0};
    struct vkd3d_shader_compile_info info = {0};
    struct vkd3d_shader_compile_option options[] =
    {
        {VKD3D_SHADER_COMPILE_OPTION_STRIP_DEBUG, 1},
        /* WebGPU has no programmable point-size builtin. The retained patch
         * extends this existing option to vertex stages while preserving its
         * default behavior for every ordinary vkd3d caller. */
        {VKD3D_SHADER_COMPILE_OPTION_WRITE_TESS_GEOM_POINT_SIZE, 0},
    };
    char *messages = NULL;
    unsigned int i;
    int result;

    if (descriptors[stage].descriptor_count > ARRAY_SIZE(bindings))
    {
        snprintf(errors[stage], sizeof(errors[stage]), "too many shader descriptors: %u",
                descriptors[stage].descriptor_count);
        return 0;
    }
    for (i = 0; i < descriptors[stage].descriptor_count; ++i)
    {
        const struct vkd3d_shader_descriptor_info *descriptor = &descriptors[stage].descriptors[i];
        struct vkd3d_shader_resource_binding *binding = &bindings[i];

        memset(binding, 0, sizeof(*binding));
        binding->type = descriptor->type;
        binding->register_space = descriptor->register_space;
        binding->register_index = descriptor->register_index;
        binding->shader_visibility = stage ? VKD3D_SHADER_VISIBILITY_PIXEL : VKD3D_SHADER_VISIBILITY_VERTEX;
        binding->flags = descriptor->resource_type == VKD3D_SHADER_RESOURCE_BUFFER
                ? VKD3D_SHADER_BINDING_FLAG_BUFFER : VKD3D_SHADER_BINDING_FLAG_IMAGE;
        binding->binding.count = descriptor->count;
        if (descriptor->type == VKD3D_SHADER_DESCRIPTOR_TYPE_CBV)
        {
            binding->binding.set = stage ? 3 : 1;
            binding->binding.binding = descriptor->register_index;
        }
        else
        {
            binding->binding.set = 2;
            binding->binding.binding = descriptor->register_index * 2
                    + (descriptor->type == VKD3D_SHADER_DESCRIPTOR_TYPE_SAMPLER);
        }
    }

    interface_info.type = VKD3D_SHADER_STRUCTURE_TYPE_INTERFACE_INFO;
    interface_info.next = varying_info;
    interface_info.bindings = bindings;
    interface_info.binding_count = descriptors[stage].descriptor_count;
    source_info.type = VKD3D_SHADER_STRUCTURE_TYPE_D3DBC_SOURCE_INFO;
    source_info.next = &interface_info;
    target_info.type = VKD3D_SHADER_STRUCTURE_TYPE_SPIRV_TARGET_INFO;
    target_info.next = &source_info;
    target_info.entry_point = "main";
    target_info.environment = VKD3D_SHADER_SPIRV_ENVIRONMENT_VULKAN_1_0;
    info.type = VKD3D_SHADER_STRUCTURE_TYPE_COMPILE_INFO;
    info.next = &target_info;
    info.source.code = bytes;
    info.source.size = length;
    info.source_type = VKD3D_SHADER_SOURCE_D3D_BYTECODE;
    info.target_type = VKD3D_SHADER_TARGET_SPIRV_BINARY;
    info.options = options;
    info.option_count = ARRAY_SIZE(options);
    info.log_level = VKD3D_SHADER_LOG_WARNING;
    result = vkd3d_shader_compile(&info, &outputs[stage], &messages);
    if (result < 0 || !outputs[stage].code || outputs[stage].size < 20 || outputs[stage].size % 4)
    {
        copy_error(stage, result, messages);
        vkd3d_shader_free_messages(messages);
        vkd3d_shader_free_shader_code(&outputs[stage]);
        memset(&outputs[stage], 0, sizeof(outputs[stage]));
        return 0;
    }
    vkd3d_shader_free_messages(messages);
    return 1;
}

int vkd3d_bridge_compile_pair(const void *vertex, unsigned int vertex_length,
        const void *pixel, unsigned int pixel_length)
{
    struct vkd3d_shader_varying_map_info varying_info = {0};
    struct vkd3d_shader_varying_map varyings[12];
    unsigned int varying_count = ARRAY_SIZE(varyings);

    vkd3d_bridge_reset();
    if (!scan_shader(0, vertex, vertex_length) || !scan_shader(1, pixel, pixel_length))
        return 0;
    vkd3d_shader_build_varying_map(&signatures[0].output, &signatures[1].input,
            &varying_count, varyings);
    if (varying_count > ARRAY_SIZE(varyings))
    {
        snprintf(errors[0], sizeof(errors[0]), "too many inter-stage varyings: %u", varying_count);
        return 0;
    }
    varying_info.type = VKD3D_SHADER_STRUCTURE_TYPE_VARYING_MAP_INFO;
    varying_info.varying_map = varyings;
    varying_info.varying_count = varying_count;
    return compile_shader(0, vertex, vertex_length, &varying_info)
            && compile_shader(1, pixel, pixel_length, NULL);
}

const void *vkd3d_bridge_output(int stage)
{
    return stage >= 0 && stage < 2 ? outputs[stage].code : NULL;
}

unsigned int vkd3d_bridge_output_length(int stage)
{
    return stage >= 0 && stage < 2 ? outputs[stage].size : 0;
}

const char *vkd3d_bridge_error(int stage)
{
    return stage >= 0 && stage < 2 ? errors[stage] : "invalid shader stage";
}

unsigned int vkd3d_bridge_input_count(void)
{
    return signatures[0].input.element_count;
}

unsigned int vkd3d_bridge_input_register(unsigned int index)
{
    return index < signatures[0].input.element_count
            ? signatures[0].input.elements[index].register_index : ~0u;
}

unsigned int vkd3d_bridge_input_semantic_index(unsigned int index)
{
    return index < signatures[0].input.element_count
            ? signatures[0].input.elements[index].semantic_index : ~0u;
}

const char *vkd3d_bridge_input_semantic(unsigned int index)
{
    return index < signatures[0].input.element_count
            ? signatures[0].input.elements[index].semantic_name : NULL;
}

const char *vkd3d_bridge_version(void)
{
    return vkd3d_shader_get_version(NULL, NULL);
}
