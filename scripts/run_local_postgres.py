"""Windows-only isolated PostgreSQL verification using downloaded official binaries."""
from pathlib import Path
import os
import secrets
import subprocess
import sys
import uuid
import zipfile
import psycopg
from psycopg import sql

root=Path(__file__).resolve().parents[1]
storage=root/'backend'/'.verification'
binary=storage/'postgres17'/'pgsql'/'bin'
if not (binary/'postgres.exe').exists():
    with zipfile.ZipFile(storage/'postgresql-17.zip') as archive:
        destination=(storage/'postgres17').resolve()
        for item in archive.infolist():
            if item.filename.startswith(('pgsql/bin/','pgsql/lib/','pgsql/share/')):
                target=(destination/item.filename).resolve()
                if not target.is_relative_to(destination):raise RuntimeError('Invalid archive path')
                archive.extract(item,destination)
work=storage/('pg-test-'+uuid.uuid4().hex[:8]);work.mkdir()
password=secrets.token_urlsafe(32)
pwfile=work/'password';pwfile.write_text(password,encoding='utf8')
data=work/'data'
flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
subprocess.run([str(binary/'initdb.exe'),'-D',str(data),'-U','postgres','--auth=scram-sha-256','--pwfile='+str(pwfile),'--encoding=UTF8','--locale=C'],check=True,creationflags=flags,stdout=subprocess.DEVNULL)
pwfile.unlink()
started=False
try:
    subprocess.run([str(binary/'pg_ctl.exe'),'-D',str(data),'-l',str(work/'server.log'),'-o','-p 55439 -h 127.0.0.1','-w','start'],check=True,creationflags=flags)
    started=True
    with psycopg.connect(host='127.0.0.1',port=55439,user='postgres',password=password,dbname='postgres',autocommit=True) as admin:
        admin.execute('CREATE DATABASE test_school_rls')
    env=os.environ.copy();env['TEST_DATABASE_URL']=f'postgresql://postgres:{password}@127.0.0.1:55439/test_school_rls'
    subprocess.run([sys.executable,'-B',str(root/'scripts'/'verify_postgres.py')],check=True,env=env)
finally:
    if started:subprocess.run([str(binary/'pg_ctl.exe'),'-D',str(data),'-m','fast','-w','stop'],creationflags=flags,check=True)
