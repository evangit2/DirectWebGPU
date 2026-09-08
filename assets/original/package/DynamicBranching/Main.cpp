#include "../Framework2/Direct3D/Direct3DApp.h"
#include "../Framework2/Util/Direct3DModel.h"

#define VENDOR_ATI    0x1002
//#define VENDOR_NVIDIA 0x10DE
//#define VENDOR_3DLABS 0x3D3D

class MainApp : public Direct3DApp {
public:
	void selectPixelFormat(PixelFormat &pf);

	void initMenu();
	void resetCamera();

	bool init();
	bool exit();

	bool load();
	bool unload();

	void drawLight(const vec3 &lightPos, const vec3 &lightColor);
	void drawIf(const vec3 &lightPos, const float radius);
	void drawLighting(const vec3 &lightPos, const float radius, const vec3 &lightColor);
	void drawDepthOnly();
	bool drawFrame();
protected:
	Direct3DModel *model;

	mat4 mvp;

	ShaderID lighting, ifStatement, depthAmbient;

	TextureID light;
	TextureID base[3], bump[3];

	bool useDynBranch, doFullClear;
};

void MainApp::selectPixelFormat(PixelFormat &pf){
	pf.stencilBits = 8;
}

void MainApp::initMenu(){
	Menu *menu = menuSystem->getMainMenu();
	menu->addMenuItem("Use dynamic branching: ", &useDynBranch, INPUT_BOOL);
	menu->addMenuItem("Full stencil clear: ", &doFullClear, INPUT_BOOL);

	App::initMenu();
}

void MainApp::resetCamera(){
	position = vec3(1800, -200, 10);
	wx = 0;
	wy = 3.1415926535f / 2;
	wz = 0;
}

bool MainApp::init(){
	model = new Direct3DModel();
	model->loadFromFile("../Models/PillarRoom/Map.hmdl");
	for (unsigned int i = 0; i < model->getBatchCount(); i++){
		model->getBatch(i)->fixTJunctions();
	}

	useDynBranch = true;
	doFullClear = true;

	return true;
}

bool MainApp::exit(){
	delete model;
	return true;
}

bool MainApp::load(){
	if (caps.PixelShaderVersion < D3DPS_VERSION(2,0) || caps.VertexShaderVersion < D3DVS_VERSION(1,1)){
		String error("This demo requires pixel shader 2.0 and vertex shader 1.1.\n"
					 "Your card/driver only supports pixel shader ");
		error.sprintf("%d.%d", (caps.PixelShaderVersion  >> 8) & 255, caps.PixelShaderVersion  & 255);
		error += " and vertex shader ";
		error.sprintf("%d.%d", (caps.VertexShaderVersion >> 8) & 255, caps.VertexShaderVersion & 255);

		addToLog(error);
		return false;
	}

	setDefaultFont("../Textures/Fonts/Future.font", "../Textures/Fonts/Future.dds");

	if ((lighting = renderer->addShader("lighting.shd")) == SHADER_NONE) return false;
	if ((ifStatement = renderer->addShader("if.shd")) == SHADER_NONE) return false;
	if ((depthAmbient = renderer->addShader("depthAmbient.shd")) == SHADER_NONE) return false;

	char *baseMaps[] = {
		"../Textures/brick01.dds",
		"../Textures/parqfloor2.dds",
		"../Textures/laying_rock7.dds"
	};

	char *bumpMaps[] = {
		"../Textures/brick01Bump.png",
		"../Textures/parqfloor2Bump.png",
		"../Textures/laying_rock7Bump.png"
	};

	for (int i = 0; i < 3; i++){
		if ((base[i] = renderer->addTexture(baseMaps[i])) == TEXTURE_NONE) return false;
		if ((bump[i] = renderer->addTexture(bumpMaps[i], TEX_NORMALHEIGHTMAP)) == TEXTURE_NONE) return false;
	}

	if ((light = renderer->addTexture("../Textures/Particle.png")) == TEXTURE_NONE) return false;

	model->uploadToVertexBuffer(dev);

	static bool first = true;
	if (first){
		D3DADAPTER_IDENTIFIER9 id;
		d3d->GetAdapterIdentifier(D3DADAPTER_DEFAULT, 0, &id);

		// ATI cards don't have to clear to be able to do fast stencil rejection.
		if (id.VendorId == VENDOR_ATI){
			menuSystem->getMainMenu()->nextValue(1);
		}

		first = false;
	}

	return true;
}

bool MainApp::unload(){
	model->freeVertexBuffer();
	return true;
}

void MainApp::drawLight(const vec3 &lightPos, const vec3 &lightColor){
	renderer->setTextures(light);
	renderer->setBlending(ONE, ONE);
	renderer->apply();

	vec3 dx(modelView.elem[0][0], modelView.elem[0][1], modelView.elem[0][2]);
	vec3 dy(modelView.elem[1][0], modelView.elem[1][1], modelView.elem[1][2]);

	struct Vertex {
		vec3 position;
		unsigned int color;
		vec2 texCoord;
	};

	Vertex vertices[4];

	vertices[0].position = lightPos + 30 * (-dx + dy);
	vertices[1].position = lightPos + 30 * ( dx + dy);
	vertices[2].position = lightPos + 30 * ( dx - dy);
	vertices[3].position = lightPos + 30 * (-dx - dy);

	vertices[0].texCoord = vec2(0, 0);
	vertices[1].texCoord = vec2(1, 0);
	vertices[2].texCoord = vec2(1, 1);
	vertices[3].texCoord = vec2(0, 1);

	vertices[0].color = vertices[1].color = vertices[2].color = vertices[3].color = toBGRA(vec4(lightColor, 0.0f));

	dev->SetFVF(D3DFVF_XYZ | D3DFVF_DIFFUSE | D3DFVF_TEXCOORDSIZE2(0) | (1 << D3DFVF_TEXCOUNT_SHIFT));
	dev->DrawPrimitiveUP(D3DPT_TRIANGLEFAN, 2, vertices, sizeof(Vertex));
}

void MainApp::drawIf(const vec3 &lightPos, const float radius){
	renderer->setShader(ifStatement);
	renderer->setMask(NONE);
	renderer->apply();

	renderer->changeShaderConstant4x4f("mvp", mvp);
	renderer->changeShaderConstant3f("lightPos", lightPos);
	renderer->changeShaderConstant1f("invRad", 1.0f / radius);

	model->draw(dev);
}

void MainApp::drawLighting(const vec3 &lightPos, const float radius, const vec3 &lightColor){
	float pSize = 0.04f;
	for (unsigned int i = 0; i < model->getBatchCount(); i++){
		renderer->setShader(lighting);

		renderer->setTexture("Bump", bump[i]);
		renderer->setTexture("Base", base[i]);
		renderer->setBlending(ONE, ONE);
		renderer->setMask(COLOR);
		renderer->apply();

		renderer->changeShaderConstant4x4f("mvp", mvp);
		renderer->changeShaderConstant3f("lightPos", lightPos);
		renderer->changeShaderConstant3f("camPos", position);
		renderer->changeShaderConstant1f("invRad", 1.0f / radius);
		renderer->changeShaderConstant2f("pSize", pSize * vec2(2, -1));
		renderer->changeShaderConstant4f("lightColor", vec4(lightColor, 1.0f));

		((Direct3DBatch *) model->getBatch(i))->draw(dev);
	}
}

void MainApp::drawDepthOnly(){
	for (unsigned int i = 0; i < model->getBatchCount(); i++){
		renderer->setTexture("Base", base[i]);
		renderer->setShader(depthAmbient);
		renderer->apply();

		renderer->changeShaderConstant4x4f("mvp", mvp);

		((Direct3DBatch *) model->getBatch(i))->draw(dev);
	}
}

bool MainApp::drawFrame(){
    dev->Clear(0, NULL, /*D3DCLEAR_TARGET | */D3DCLEAR_ZBUFFER | D3DCLEAR_STENCIL, D3DCOLOR_RGBA(0, 0, 0, 0), 1.0f, 0);
	dev->SetRenderState(D3DRS_CULLMODE, D3DCULL_CCW);

	projection = projectionMatrixX(1.5f, float(height) / float(width), 1, 6000);
	dev->SetTransform(D3DTS_PROJECTION, (D3DMATRIX *) (const float *) transpose(projection));

	modelView = rotateZXY(-wx, -wy, -wz);
	modelView.translate(-position);
	dev->SetTransform(D3DTS_VIEW, (D3DMATRIX *) (const float *) transpose(modelView));

	mvp = projection * modelView;


	drawDepthOnly();


	vec3 lightPos[] = {
		vec3(900 * cosf(time), -256, 900 * sinf(time)),
		vec3(800 * cosf(1.21f * time), 1400 * sinf(1.21f * time),  800),
		vec3(800 * sinf(1.21f * time), 1400 * cosf(1.21f * time), -800),
		vec3(700 * sinf(1.87f * time), -1200, 700 * cosf(1.87f * time)),
		vec3(700 * sinf(1.87f * time),  1200, 700 * cosf(1.87f * time)),
	};
	static vec3 lightColor[] = {
		vec3(1.0f, 0.5f, 0.1f),
		vec3(0.0f, 0.5f, 1.0f),
		vec3(0.5f, 1.0f, 0.5f),
		vec3(1,1,1),
		vec3(1,1,1),
	};

	for (int i = 0; i < sizeof(lightPos) / sizeof(vec3); i++){
		if (useDynBranch){
			if (doFullClear && i != 0){
			    dev->Clear(0, NULL, D3DCLEAR_STENCIL, 0, 1.0f, 0);
			}
			dev->SetRenderState(D3DRS_ALPHATESTENABLE, TRUE);
			dev->SetRenderState(D3DRS_ALPHAFUNC, D3DCMP_LESS);
			dev->SetRenderState(D3DRS_ALPHAREF, 0xFF);

			dev->SetRenderState(D3DRS_STENCILENABLE, TRUE);
			dev->SetRenderState(D3DRS_STENCILFUNC, D3DCMP_ALWAYS);
			dev->SetRenderState(D3DRS_STENCILREF, 1);

			dev->SetRenderState(D3DRS_STENCILFAIL,  D3DSTENCILOP_KEEP);
			dev->SetRenderState(D3DRS_STENCILZFAIL, D3DSTENCILOP_KEEP);
			dev->SetRenderState(D3DRS_STENCILPASS,  D3DSTENCILOP_REPLACE);

			drawIf(lightPos[i], 800);

			dev->SetRenderState(D3DRS_ALPHATESTENABLE, FALSE);

			dev->SetRenderState(D3DRS_STENCILFUNC, D3DCMP_EQUAL);
			if (doFullClear){
				dev->SetRenderState(D3DRS_STENCILPASS, D3DSTENCILOP_KEEP);
			} else {
				dev->SetRenderState(D3DRS_STENCILPASS, D3DSTENCILOP_ZERO);
			}
		}

		drawLighting(lightPos[i], 800, lightColor[i]);

		if (useDynBranch){
			dev->SetRenderState(D3DRS_STENCILENABLE, FALSE);
		}
	}

	for (int j = 0; j < sizeof(lightPos) / sizeof(vec3); j++){
		drawLight(lightPos[j], lightColor[j]);
	}

	return true;
}

App *app = new MainApp();
