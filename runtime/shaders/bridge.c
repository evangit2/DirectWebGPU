/* Local consumer of unmodified MojoShader; not an upstream contribution. */
#include "mojoshader.h"
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>
static const MOJOSHADER_parseData *stages[2];
static int lengths[2];
static char error[2048];
/* Track allocations as a per-pair arena as well as supporting individual frees.
 * This also reclaims MojoShader patch-table allocations after linking. */
typedef union Allocation Allocation;
union Allocation {struct {Allocation *prev,*next;size_t size;} node;max_align_t align;};
static Allocation *allocations;static size_t allocated;
static void *pair_alloc(int bytes,void *unused){
    (void)unused;if(bytes<0||(size_t)bytes>32*1024*1024-allocated)return NULL;
    Allocation *a=malloc(sizeof(*a)+(size_t)bytes);if(!a)return NULL;
    a->node.prev=NULL;a->node.next=allocations;a->node.size=bytes;
    if(allocations)allocations->node.prev=a;allocations=a;allocated+=bytes;return a+1;
}
static void pair_free(void *ptr,void *unused){
    (void)unused;if(!ptr)return;Allocation *a=(Allocation *)ptr-1;
    if(a->node.prev)a->node.prev->node.next=a->node.next;else allocations=a->node.next;
    if(a->node.next)a->node.next->node.prev=a->node.prev;allocated-=a->node.size;free(a);
}
void shader_reset(void) {
    for(int i=0;i<2;i++){MOJOSHADER_freeParseData(stages[i]);stages[i]=NULL;lengths[i]=0;}
    while(allocations)pair_free(allocations+1,NULL);
    error[0]=0;
}
const char *shader_error(void){return error;}
const void *shader_output(int stage){return stage>=0&&stage<2&&stages[stage]?stages[stage]->output:NULL;}
int shader_length(int stage){return stage>=0&&stage<2?lengths[stage]:0;}
/* Reflection remains owned by the pair arena until shader_reset. */
int shader_uniform_count(int stage){return stage>=0&&stage<2&&stages[stage]?stages[stage]->uniform_count:0;}
int shader_uniform_value(int stage,int index,int field){
    if(index<0||index>=shader_uniform_count(stage))return -1;
    const MOJOSHADER_uniform *u=&stages[stage]->uniforms[index];
    switch(field){case 0:return u->type;case 1:return u->index;case 2:return u->array_count;case 3:return u->constant;default:return -1;}
}
int shader_constant_count(int stage){return stage>=0&&stage<2&&stages[stage]?stages[stage]->constant_count:0;}
uint32_t shader_constant_value(int stage,int index,int field){
    if(index<0||index>=shader_constant_count(stage))return UINT32_MAX;
    const MOJOSHADER_constant *c=&stages[stage]->constants[index];
    if(field==0)return c->type;if(field==1)return c->index;
    if(field<2||field>5)return UINT32_MAX;
    uint32_t value=0;
    if(c->type==MOJOSHADER_UNIFORM_BOOL){if(field==2)value=c->value.b!=0;}
    else if(c->type==MOJOSHADER_UNIFORM_FLOAT)memcpy(&value,&c->value.f[field-2],4);
    else memcpy(&value,&c->value.i[field-2],4);
    return value;
}
/* Pair linking is needed because DX9 semantic linkage is not SPIR-V linkage.
 * This initial boundary supports float vertex attributes. Integer declarations
 * must be implemented before they are accepted by the D3D frontend. */
int shader_pair(const unsigned char *vs, unsigned vlen,const unsigned char *ps,unsigned plen){
    shader_reset();
    if(!vs||!ps||vlen<8||plen<8||vlen>1048576||plen>1048576||(vlen&3)||(plen&3)){
        snprintf(error,sizeof(error),"invalid bytecode length (8..1048576 bytes, DWORD aligned)");return 0;
    }
    const unsigned char *input[2]={vs,ps};unsigned sizes[2]={vlen,plen};
    unsigned char *declared_vs=NULL;
    /* MojoShader's SPIR-V backend needs attributes before its first load.
     * DX9 VS1.1 leaves declarations in external device state. Normalize to
     * explicit float input registers identified by the validation pass, preserving every instruction.
     * TEXCOORD indices here identify input registers, not output semantics. */
    uint32_t version;memcpy(&version,vs,4);
    if(version==0xfffe0101u){
        const MOJOSHADER_parseData *check=MOJOSHADER_parse("bytecode","main",vs,vlen,NULL,0,NULL,0,pair_alloc,pair_free,NULL);
        if(!check||check->error_count){snprintf(error,sizeof(error),"VS1.1 validation: %s",check&&check->error_count?check->errors[0].error:"allocation failed");MOJOSHADER_freeParseData(check);return 0;}
        uint32_t registers[16];unsigned count=0;
        for(int a=0;a<check->attribute_count;a++){
            MOJOSHADER_attribute attr=check->attributes[a];int reg=-1;
            if(attr.index==0&&attr.usage>=MOJOSHADER_USAGE_POSITION&&attr.usage<=MOJOSHADER_USAGE_POINTSIZE)reg=attr.usage;
            else if(attr.usage==MOJOSHADER_USAGE_COLOR&&attr.index<=1)reg=5+attr.index;
            else if(attr.usage==MOJOSHADER_USAGE_TEXCOORD&&attr.index<=7)reg=7+attr.index;
            else if(attr.usage==MOJOSHADER_USAGE_POSITION&&attr.index==1)reg=15;
            if(reg<0||reg>15||count>=16){snprintf(error,sizeof(error),"unsupported VS1.1 input declaration");MOJOSHADER_freeParseData(check);return 0;}
            registers[count++]=reg;
        }
        MOJOSHADER_freeParseData(check);
        declared_vs=malloc(vlen+count*12);
        if(!declared_vs){snprintf(error,sizeof(error),"allocation failed");return 0;}
        memcpy(declared_vs,vs,4);
        for(unsigned a=0;a<count;a++){
            uint32_t reg=registers[a];
            uint32_t decl[3]={31,0x80000005u|(reg<<16),0x900f0000u|reg};
            memcpy(declared_vs+4+a*12,decl,12);
        }
        memcpy(declared_vs+4+count*12,vs+4,vlen-4);
        input[0]=declared_vs;sizes[0]=vlen+count*12;
    }
    for(int i=0;i<2;i++){
        stages[i]=MOJOSHADER_parse("spirv","main",input[i],sizes[i],NULL,0,NULL,0,pair_alloc,pair_free,NULL);
        if(i==0){free(declared_vs);declared_vs=NULL;}
        const MOJOSHADER_parseData *p=stages[i];
        if(!p||p->error_count){snprintf(error,sizeof(error),"%s bytecode: %s at byte %d",i?"pixel":"vertex",p&&p->error_count?p->errors[0].error:"allocation failure",p&&p->error_count?p->errors[0].error_position:-1);return 0;}
        if(p->shader_type!=(i?MOJOSHADER_TYPE_PIXEL:MOJOSHADER_TYPE_VERTEX)){
            snprintf(error,sizeof(error),"wrong shader stage at slot %d",i);return 0;
        }
        if(p->preshader){snprintf(error,sizeof(error),"D3DX preshader execution not implemented");return 0;}
    }
    int table=MOJOSHADER_linkSPIRVShaders(stages[0],stages[1],NULL,0);
    for(int i=0;i<2;i++){
        lengths[i]=stages[i]->output_len-table;
        if(table<=0||lengths[i]<20||(lengths[i]&3)){snprintf(error,sizeof(error),"invalid SPIR-V link output");return 0;}
    }
    return 1;
}
#ifdef SHADER_NATIVE_TEST
int main(int argc,char **argv){
    if(argc!=4){fprintf(stderr,"usage: shader-pair vertex.bin pixel.bin output-prefix\n");return 2;}
    unsigned char bytes[2][1048577];size_t lengths[2];
    for(int i=0;i<2;i++){FILE *f=fopen(argv[i+1],"rb");if(!f)return 2;lengths[i]=fread(bytes[i],1,sizeof(bytes[i]),f);fclose(f);}
    if(!shader_pair(bytes[0],lengths[0],bytes[1],lengths[1])){fprintf(stderr,"%s\n",shader_error());shader_reset();return 1;}
    for(int i=0;i<2;i++){char path[4096];snprintf(path,sizeof(path),"%s.%s.spv",argv[3],i?"frag":"vert");FILE *f=fopen(path,"wb");if(!f)return 2;fwrite(shader_output(i),1,shader_length(i),f);fclose(f);}
    shader_reset();return 0;
}
#endif
