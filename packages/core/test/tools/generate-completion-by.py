# Generator der unabhängigen Completion-Vergleichsdaten mit BY-Teilen aus der Nachprüfung vom
# 24.10.2026 (docs/REVIEW-WIEDERHOLUNGEN-2026-10-24.md). Wird nicht in der CI ausgeführt; die
# Ausgabe liegt eingefroren unter ../fixtures/completion-by-reference.json und wird von
# completion-by-reference.test.ts gelesen.
#
# Referenzstand: python-dateutil 2.9.0.post0, Seed 20261024.
# Aufruf:  python3 -I packages/core/test/tools/generate-completion-by.py
# Ergebnis: 770 von 800 Fällen; 30 überschritten in dateutil 300 ms und stehen in
#           completion-by-timeouts.json (nicht als geprüft gezählt).
import os
import calendar, datetime as dt, itertools, json, random, signal
from dateutil.rrule import rrulestr

rng = random.Random(20261024)
patterns = {
 'DAILY': ['BYDAY=MO', 'BYDAY=MO,WE,FR', 'BYMONTHDAY=1,-1', 'BYMONTH=1,7;BYDAY=MO,FR'],
 'WEEKLY': ['BYDAY=MO', 'BYDAY=MO,WE,FR', 'BYMONTH=1,7;BYDAY=TU,TH', 'BYDAY=MO;BYSETPOS=1,-1'],
 'MONTHLY': ['BYDAY=1MO;BYSETPOS=1,-1', 'BYDAY=1MO;BYSETPOS=-2', 'BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', 'BYMONTHDAY=31', 'BYMONTHDAY=1,-1;BYSETPOS=1,-1'],
 'YEARLY': ['BYMONTH=2;BYMONTHDAY=29', 'BYWEEKNO=53;BYDAY=MO', 'BYYEARDAY=366', 'BYMONTH=1,12;BYDAY=MO;BYSETPOS=1,-1', 'BYDAY=1MO;BYSETPOS=1,-1'],
}
def alarm(*args): raise TimeoutError()
signal.signal(signal.SIGALRM, alarm)
cases=[]; timeouts=[]
for i in range(800):
 freq=list(patterns)[i%4]
 k=dt.date(rng.choice([2000,2024,2026,2028,2096,2099]),rng.randint(1,12),rng.choice([1,15,28]))
 day=k+dt.timedelta(days=rng.choice([-40,-1,0,3,40,400]))
 action=rng.choice(['complete','skip'])
 base=day if action=='complete' else max(day,k)
 time=dt.time(rng.choice([0,2,9,23]),30)
 core=f'FREQ={freq};INTERVAL={rng.choice([1,2,3,4,7])};{rng.choice(patterns[freq])};WKST={rng.choice(["MO","SU","WE"])}'
 mode=rng.choice(['none','count','until'])
 count=rng.choice([1,2,3,8]) if mode=='count' else None
 until=dt.datetime.combine(k+dt.timedelta(days=rng.choice([0,30,500,2000])), dt.time(rng.choice([0,8,23]),0)) if mode=='until' else None
 rule=core+(f';COUNT={count}' if count is not None else '')+(';UNTIL='+until.strftime('%Y%m%dT%H%M%S') if until else '')
 C={str(k-dt.timedelta(days=n)) for n in rng.sample(range(1,50),rng.randrange(4))}
 S=set()
 rr=rrulestr(core,dtstart=dt.datetime.combine(base,time)).replace(until=until)
 signal.setitimer(signal.ITIMER_REAL,0.3)
 try: candidates=list(itertools.islice((v for v in rr if v.date()>base),12))
 except TimeoutError:
  timeouts.append(rule); continue
 finally: signal.setitimer(signal.ITIMER_REAL,0)
 for c in candidates[:rng.randrange(3)]:
  if c.date()!=k: S.add(str(c.date()))
 beforeC=sorted(C); beforeS=sorted(S)
 (C if action=='complete' else S).add(str(k))
 nxt=None
 if not (action=='complete' and count is not None and len(C)>=count):
  nxt=next((str(v.date()) for v in candidates if str(v.date()) not in C|S),None)
 # An impossible rule without UNTIL has no next date but is correctly blocked, not exhausted.
 impossible = not candidates and until is None and nxt is None and not(action=='complete' and count is not None and len(C)>=count)
 cases.append(dict(rule=rule,k=str(k),actionDay=str(day),time=time.strftime('%H:%M'),action=action,C=beforeC,S=beforeS,next=nxt,impossible=impossible))
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fixtures', 'completion-by-reference.json'),'w') as f: json.dump(cases,f,indent=1)
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'completion-by-timeouts.json'),'w') as f: json.dump(timeouts,f,indent=1)
print(json.dumps(dict(generated=len(cases),reference_timeouts=len(timeouts))))
