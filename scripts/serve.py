"""Loopback-only static runtime server and bounded session evidence receiver."""
import http.server,pathlib,json,secrets,time,urllib.parse,hashlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
WEB=ROOT/'web'; SESSIONS={}; MAX_BODY=262144
class Handler(http.server.BaseHTTPRequestHandler):
 def end_headers(self):
  self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');self.send_header('Cross-Origin-Resource-Policy','same-origin');self.send_header('Cache-Control','no-store');super().end_headers()
 def reply(self,code,data,ctype='application/json'):
  if not isinstance(data,bytes): data=json.dumps(data).encode()
  self.send_response(code);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_GET(self):
  path=urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
  if path=='/api/build':
   deps=json.loads((ROOT/'dependencies.json').read_text())
   revision=subprocess.run(['git','rev-parse','--verify','HEAD'],cwd=ROOT,capture_output=True,text=True).stdout.strip() or 'uncommitted'
   dirty=bool(subprocess.run(['git','status','--porcelain'],cwd=ROOT,capture_output=True,text=True).stdout)
   files=[{'path':str(p.relative_to(ROOT/'assets/original/package')),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((ROOT/'assets/original/package').rglob('*')) if p.is_file()]
   return self.reply(200,{'revision':revision,'dirty':dirty,'dependencies':deps,'files':files,'wasm_available':(WEB/'generated/runtime-build.json').exists(),'runtimeBuild':json.loads((WEB/'generated/runtime-build.json').read_text()) if (WEB/'generated/runtime-build.json').exists() else None})
  if path.startswith('/assets/'):
   base=ROOT/'assets/original/package'; p=(base/path.removeprefix('/assets/')).resolve()
  else:
   base=WEB; p=(base/('index.html' if path in ['/','/humus-runtime','/humus-runtime/'] else path.lstrip('/'))).resolve()
  if not p.is_relative_to(base.resolve()) or not p.is_file(): return self.reply(404,{'error':'not found'})
  import mimetypes
  self.reply(200,p.read_bytes(),mimetypes.guess_type(p.name)[0] or 'application/octet-stream')
 def do_POST(self):
  # Same-origin browser clients only; random session token is required after creation.
  if self.headers.get('Host') not in [f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'] or self.headers.get('Origin')!=f'http://{self.headers.get("Host")}': return self.reply(403,{'error':'origin'})
  try:
   size=int(self.headers.get('Content-Length','0'))
   if size<1 or size>MAX_BODY: return self.reply(413,{'error':'body limit'})
   body=json.loads(self.rfile.read(size))
   now=time.time()
   for key in list(SESSIONS):
    if SESSIONS[key]['expires']<now: del SESSIONS[key]
   if self.path=='/api/session':
    if len(SESSIONS)>=16:return self.reply(429,{'error':'session limit'})
    token=secrets.token_hex(24); SESSIONS[token]={'expires':now+14500,'bytes':0,'seq':0}
    return self.reply(201,{'token':token})
   token=body.get('token','');session=SESSIONS.get(token)
   if self.path!='/api/evidence' or not session:return self.reply(403,{'error':'session'})
   if session['bytes']+size>4*1024*1024:return self.reply(413,{'error':'session size limit'})
   session['bytes']+=size;session['seq']+=1
   dest=ROOT/'evidence/sessions'/token;dest.mkdir(parents=True,exist_ok=True)
   body.pop('token',None);(dest/f'{session["seq"]:04}.json').write_text(json.dumps(body,indent=2)+'\n')
   self.reply(200,{'saved':True})
  except (ValueError,TypeError):self.reply(400,{'error':'bad request'})
 def log_message(self,fmt,*args): pass
if __name__=='__main__':
 port=int(sys.argv[1]) if len(sys.argv)>1 else 8765
 print(f'http://127.0.0.1:{port}/humus-runtime',flush=True)
 http.server.ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
