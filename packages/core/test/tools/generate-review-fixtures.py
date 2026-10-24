# Generator der unabhängigen Vergleichsdaten aus dem Review vom 23.10.2026
# (docs/REVIEW-WIEDERHOLUNGEN-2026-10-23.md). Wird nicht in der CI ausgeführt;
# die Ausgaben liegen eingefroren unter ../fixtures/ und werden von
# dateutil-generated.test.ts und completion-reference.test.ts gelesen.
#
# Referenzstand: python-dateutil 2.9.0.post0, Seed 20261023.
# Aufruf:  python3 -I packages/core/test/tools/generate-review-fixtures.py
# Erzeugt: fixtures/dateutil-generated.json (1.357 von 1.600 Fällen; die übrigen
#          überschritten 50 ms in dateutil und stehen in reference-timeouts.json),
#          fixtures/completion-reference.json (1.200 Fälle, eigene Kalenderarithmetik
#          ohne App-Berechnung: fester Abstand ab B mit Klemmen ans Monatsende,
#          Kollisionen mit C/S übersprungen, COUNT zählt Erledigungen, UNTIL inklusiv).
import calendar
import datetime as dt
import itertools
import json
import os
import random
import signal
from dateutil.rrule import rrulestr

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "..", "fixtures")

def dump(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=1)
        f.write("\n")

rng = random.Random(20261023)
out = []
slow = []
def alarm(signum, frame):
    raise TimeoutError()
signal.signal(signal.SIGALRM, alarm)
freqs = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
for i in range(1600):
    freq = freqs[i % 4]
    year = rng.choice([1999, 2000, 2026, 2027, 2028, 2096, 2099])
    month = rng.randrange(1, 13)
    day = rng.randrange(1, calendar.monthrange(year, month)[1] + 1)
    start = dt.datetime(year, month, day, rng.choice([0, 2, 9, 23]), 30)
    parts = [f'FREQ={freq}', f'INTERVAL={rng.choice([1, 1, 2, 3, 4, 7])}']
    if rng.random() < 0.65:
        days = rng.sample(weekdays, rng.randrange(1, 5))
        if freq in ['MONTHLY', 'YEARLY'] and rng.random() < 0.35:
            days = [f'{rng.choice([-2,-1,1,2,3,4])}{days[0]}']
        parts.append('BYDAY=' + ','.join(days))
    if freq != 'WEEKLY' and rng.random() < 0.5:
        parts.append('BYMONTHDAY=' + ','.join(map(str, rng.sample([1,2,15,28,29,30,31,-1,-2,-5], rng.randrange(1,4)))))
    if rng.random() < 0.4:
        parts.append('BYMONTH=' + ','.join(map(str, rng.sample(list(range(1,13)), rng.randrange(1,4)))))
    if freq == 'YEARLY' and rng.random() < 0.2:
        parts.append('BYYEARDAY=' + ','.join(map(str, rng.sample([1,59,60,61,100,365,366,-1,-60], 2))))
    if freq == 'YEARLY' and not any(p.startswith('BYDAY=') for p in parts) and rng.random() < 0.25:
        parts.append(f'BYWEEKNO={rng.choice([1,2,52,53,-1,-2])}')
    if any(p.startswith('BY') for p in parts) and rng.random() < 0.35:
        parts.append('BYSETPOS=' + ','.join(map(str, rng.sample([-2,-1,1,2,3], rng.randrange(1,3)))))
    parts.append(f'WKST={rng.choice(weekdays)}')
    end = start.replace(year=start.year+12, day=min(start.day, calendar.monthrange(start.year+12, start.month)[1]))
    if rng.random() < 0.4:
        parts.append(f'COUNT={rng.choice([1,2,3,10,30])}')
    else:
        end = end.replace(hour=rng.choice([0,8,23]), minute=0)
        parts.append('UNTIL=' + end.strftime('%Y%m%dT%H%M%S'))
    rule = ';'.join(parts)
    rr = rrulestr(rule, dtstart=start).replace(until=end)
    signal.setitimer(signal.ITIMER_REAL, 0.05)
    try:
        dates = [v.strftime('%Y-%m-%d') for v in itertools.islice(rr,16)]
    except TimeoutError:
        slow.append(rule)
        continue
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
    out.append(dict(rule=rule, start=start.strftime('%Y-%m-%d'), time=start.strftime('%H:%M'), dates=dates, through=end.strftime('%Y-%m-%d')))

dump(os.path.join(FIXTURES, 'dateutil-generated.json'), out)
print(f'Generated {len(out)} dateutil cases; {len(slow)} reference cases exceeded 50ms and were omitted.', flush=True)
dump(os.path.join(HERE, 'reference-timeouts.json'), slow)

out = []
def add(base, unit, interval):
    if unit == 'DAILY': return base + dt.timedelta(days=interval)
    if unit == 'WEEKLY': return base + dt.timedelta(weeks=interval)
    months = interval if unit == 'MONTHLY' else interval * 12
    idx = base.year*12 + base.month-1 + months
    y,m = divmod(idx,12)
    return base.replace(year=y, month=m+1, day=min(base.day, calendar.monthrange(y,m+1)[1]))
for i in range(1200):
    freq = freqs[i%4]
    year = rng.choice([1999,2000,2026,2027,2028,2099])
    month = rng.randrange(1,13)
    day = rng.choice([1,15,28,calendar.monthrange(year,month)[1]])
    k = dt.date(year,month,day)
    action_day = k + dt.timedelta(days=rng.choice([-100,-40,-7,-2,0,1,15,60,400]))
    interval = rng.choice([1,2,3,5,12,24])
    action = rng.choice(['complete','skip'])
    base = action_day if action == 'complete' else max(action_day,k)
    C = {k-dt.timedelta(days=n) for n in rng.sample(list(range(1,60)), rng.randrange(0,6))}
    S = {add(base,freq,interval*n) for n in rng.sample(list(range(1,10)),rng.randrange(0,5))} - {k}
    end_mode = rng.choice(['none','count','until'])
    count = rng.choice([1,2,3,8]) if end_mode == 'count' else None
    until = k + dt.timedelta(days=rng.choice([0,2,10,30,100,400])) if end_mode == 'until' else None
    before_C = sorted(str(v) for v in C)
    before_S = sorted(str(v) for v in S)
    (C if action == 'complete' else S).add(k)
    nxt = None
    if not (action == 'complete' and count is not None and len(C)>=count):
        for n in range(1,100):
            candidate = add(base,freq,interval*n)
            if until is not None and candidate > until: break
            if candidate in C or candidate in S: continue
            nxt = str(candidate)
            break
    rule=f'FREQ={freq};INTERVAL={interval}'
    if count is not None: rule += f';COUNT={count}'
    if until is not None: rule += ';UNTIL=' + until.strftime('%Y%m%d')
    out.append(dict(rule=rule, k=str(k), actionDay=str(action_day), action=action, C=before_C, S=before_S, next=nxt))
dump(os.path.join(FIXTURES, 'completion-reference.json'), out)
print(f'Generated {len(out)} independent completion action cases.', flush=True)
