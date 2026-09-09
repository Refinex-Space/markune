"""Opt-in real-model contract evaluation. Uses only synthetic input; author: refinex."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import time
import tomllib

parser = argparse.ArgumentParser()
parser.add_argument('--binary', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--limit', type=int, default=100)
parser.add_argument('--resume', action='store_true')
parser.add_argument('--retry-failed', action='store_true')
args = parser.parse_args()
if os.environ.get('MARKUNE_RUN_MODEL_EVAL') != '1':
    raise SystemExit('Set MARKUNE_RUN_MODEL_EVAL=1 only after authorizing real-model usage.')
project = Path(__file__).resolve().parents[1]
cases = json.loads((project / 'evals/codex/writing-cases.json').read_text())[:max(1, min(args.limit, 100))]
config_home = Path(os.environ.get('CODEX_HOME', Path.home() / '.codex'))
config = tomllib.loads((config_home / 'config.toml').read_text()) if (config_home / 'config.toml').exists() else {}
extra = []
for name in config.get('mcp_servers', {}):
    if '.' in name: raise SystemExit('Dotted MCP names require explicit per-session configuration; no model test was started.')
    extra += ['-c', f'mcp_servers.{name}.enabled=false']
for flag in ['shell_tool', 'apps', 'plugins', 'multi_agent', 'hooks', 'codex_hooks']:
    extra += ['-c', f'features.{flag}=false']
extra += ['-c', 'web_search="disabled"', '-c', 'approval_policy="never"', '-c', 'model_reasoning_effort="medium"']
report = {'kind': 'real-model-synthetic-constraints', 'cases': [], 'status': 'running', 'humanQualityAssessment': 'not-performed', 'executionAttempts': 0, 'completedModelBatches': 0}
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
if args.resume and output.exists():
    report=json.loads(output.read_text())
    report['status']='running'
    if args.retry_failed: report['cases']=[case for case in report['cases'] if case['passed']]
    completed_ids={case['id'] for case in report['cases']}
    cases=[case for case in cases if case['id'] not in completed_ids]
report['model']=config.get('model','runtime-default')
report['reasoningEffort']='medium'
def save():
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
with tempfile.TemporaryDirectory(prefix='markune-writing-eval-') as working:
    work = Path(working)
    schema = work / 'output-schema.json'
    schema.write_text(json.dumps({'type':'object','properties':{'results':{'type':'array','items':{'type':'object','properties':{'id':{'type':'string'},'markdown':{'type':'string'}},'required':['id','markdown'],'additionalProperties':False}}},'required':['results'],'additionalProperties':False}))
    for start in range(0, len(cases), 10):
        batch = cases[start:start+10]
        message = '独立处理每个合成写作测试。每项只按 instruction 修改 source，保留其他内容。不要调用任何工具。返回 results 数组，每项包含原 id 和完整修改后 markdown；不要解释或添加代码围栏。\n' + json.dumps([{k:v for k,v in item.items() if k in ['id','instruction','source']} for item in batch], ensure_ascii=False)
        answer = work / 'answer.json'
        if answer.exists():
            answer.unlink()
        began = time.monotonic()
        try:
            completed = subprocess.run([args.binary, 'exec', '--ephemeral', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', str(work), '--output-schema', str(schema), '--output-last-message', str(answer), *extra, '-'], input=message, text=True, capture_output=True, timeout=150)
            report['executionAttempts'] += 1
            if completed.returncode != 0:
                raw = completed.stdout + completed.stderr
                first = next((line for line in completed.stderr.splitlines() if 'error' in line.lower()), 'Execution failed')
                for line in completed.stdout.splitlines():
                    try:
                        event = json.loads(line)
                        item = event.get('item', event)
                        if item.get('type') in ['error', 'turn.failed']:
                            value = item.get('message', item.get('error', {}).get('message'))
                            if isinstance(value, str): first = value
                    except (ValueError, AttributeError):
                        pass
                for _ in range(4):
                    try:
                        obj = json.loads(first)
                        if isinstance(obj, dict):
                            nested = obj.get('error', obj.get('body', obj))
                            if isinstance(nested, dict): nested = nested.get('message', nested.get('detail', nested))
                            if isinstance(nested, str): first = nested
                            else: break
                        else: break
                    except ValueError: break
                first = re.sub(r'''"[^"]*"|'[^']*'|https?://[^\s]+|(?:/[\w.-]+){2,}|[A-Za-z0-9_-]{16,}''', '<redacted>', first)
                report['diagnosticSummary'] = first[:240]
                reason = 'authentication' if '401' in raw or 'not logged in' in raw.lower() else 'quota' if '429' in raw or 'usage limit' in raw.lower() else 'runtime-error'
                report.update(status='blocked', failure=reason, exitCode=completed.returncode, diagnosticCategories=[word for word in ['insufficient','forbidden','quota','unauthorized','unsupported','not available','unknown variant','invalid value','unexpected argument','config','permission','authentication','not supported','model','keyring','timeout','no such file','read-only'] if word in raw.lower()])
                save()
                print(json.dumps({'status':'blocked','reason':reason}), flush=True)
                break
            report['completedModelBatches'] += 1
            data = json.loads(answer.read_text())
            answers = {item['id']: item['markdown'] for item in data['results'] if isinstance(item.get('markdown'), str)}
            for case in batch:
                text = answers.get(case['id'], '')
                missing = [value for value in case['required'] if value not in text]
                missing += ['required-pattern:'+pattern for pattern in case.get('requiredPatterns',[]) if not re.search(pattern,text)]
                forbidden = [value for value in case['forbidden'] if value in text]
                report['cases'].append({'id':case['id'], 'passed':bool(text) and not missing and not forbidden, 'missingRequired':missing, 'forbiddenFound':forbidden, 'outputSha256':hashlib.sha256(text.encode()).hexdigest(), **({'reviewText':text[:4000]} if missing or forbidden else {})})
            print(json.dumps({'completed':len(report['cases']),'passed':sum(c['passed'] for c in report['cases']),'batchSeconds':round(time.monotonic()-began,2)}), flush=True)
        except subprocess.TimeoutExpired:
            report.update(status='blocked', failure='timeout')
            save()
            print('{"status":"blocked","reason":"timeout"}', flush=True)
            break
        except (OSError, ValueError, KeyError, TypeError):
            report.update(status='blocked', failure='invalid-model-output')
            save()
            print('{"status":"blocked","reason":"invalid-model-output"}', flush=True)
            break
        save()
    else:
        report['status'] = 'completed'
        report['passed'] = sum(case['passed'] for case in report['cases'])
        save()

raise SystemExit(0 if report['status']=='completed' and all(case['passed'] for case in report['cases']) else 2)
