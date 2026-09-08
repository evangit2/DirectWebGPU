import importlib.util,pathlib,threading,http.client,json,tempfile
r=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('local_server',r/'scripts/serve.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
server=m.http.server.ThreadingHTTPServer(('127.0.0.1',0),m.Handler)
t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
port=server.server_port
conn=http.client.HTTPConnection('127.0.0.1',port)
def request(method,path,body=None,headers=None):
 conn.request(method,path,body=body,headers=headers or {});response=conn.getresponse();data=response.read();return response,data
try:
 response,body=request('GET','/humus-runtime')
 assert response.status==200 and b'Start Humus' in body
 assert response.getheader('Cross-Origin-Opener-Policy')=='same-origin'
 assert response.getheader('Cross-Origin-Embedder-Policy')=='require-corp'
 assert request('GET','/assets/../../dependencies.json')[0].status==404
 assert request('POST','/api/session','{}')[0].status==403
 headers={'Origin':f'http://127.0.0.1:{port}','Content-Type':'application/json'}
 response,body=request('POST','/api/session','{}',headers);assert response.status==201
 token=json.loads(body)['token'];assert len(token)==48
 assert request('POST','/api/evidence',json.dumps({'token':'invalid'}),headers)[0].status==403
 assert request('POST','/api/evidence','x'*262145,headers)[0].status==413
 # Store evidence only in a temporary directory during this test.
 with tempfile.TemporaryDirectory() as d:
  old=m.ROOT;m.ROOT=pathlib.Path(d)
  try:
   assert request('POST','/api/evidence',json.dumps({'token':token,'report':{'test':True}}),headers)[0].status==200
   assert len(list(m.ROOT.rglob('*.json')))==1
   assert request('POST','/api/evidence',json.dumps({'token':token,'report':{'endedAt':'completed'}}),headers)[0].status==200
   assert token not in m.SESSIONS
   for _ in range(20):
    response,body=request('POST','/api/session','{}',headers);assert response.status==201
    current=json.loads(body)['token']
    assert request('POST','/api/evidence',json.dumps({'token':current,'report':{'result':'passed'}}),headers)[0].status==200
   assert not m.SESSIONS
   for _ in range(16):assert request('POST','/api/session','{}',headers)[0].status==201
   assert request('POST','/api/session','{}',headers)[0].status==429
  finally:m.ROOT=old
 print('PASS: route, isolation headers, path confinement, origin/token checks, request limit, evidence persistence, terminal session retirement, active session limit')
finally:conn.close();server.shutdown();server.server_close()
