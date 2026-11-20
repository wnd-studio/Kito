import { readFileSync } from 'node:fs';
import { ingest, list, get, stats, recentEvents, recentRuns, queue, notifications, claimSubmission, transition, markNotified, startRun, finishRun, packet, close } from './core.mjs';

const [command, ...args] = process.argv.slice(2);
const print = value => console.log(JSON.stringify(value,null,2));
try {
  switch(command) {
    case 'import': {
      if (!args[0]) throw Error('Uso: node cli.mjs import caminho.json ou caminho.ndjson');
      const raw=readFileSync(args[0],'utf8');
      const items=args[0].endsWith('.ndjson')?raw.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x)):JSON.parse(raw);
      const results=[];
      for (const item of Array.isArray(items)?items:[items]) {
        try {results.push(ingest(item));} catch(error) {results.push({error:error.message,company:item?.company,title:item?.title});}
      }
      print({added:results.filter(x=>x.created).length,already_present:results.filter(x=>x.created===false).length,failed:results.filter(x=>x.error).length,results});
      if(results.some(x=>x.error)) process.exitCode=1;
      break;
    }
    case 'list': print(list({status:args[0]||''}));break;
    case 'get': print(get(args[0]));break;
    case 'stats': print(stats());break;
    case 'events': print(recentEvents());break;
    case 'runs': print(recentRuns());break;
    case 'queue': print(queue());break;
    case 'claim': print(claimSubmission(args[0]));break;
    case 'notifications': print(notifications());break;
    case 'notified': print(markNotified(args[0]));break;
    case 'submitted': print(transition(args[0],'submitted',args.slice(1).join(' ')));break;
    case 'needs-action': print(transition(args[0],'needs_action',args.slice(1).join(' ')));break;
    case 'failed': print(transition(args[0],'failed',args.slice(1).join(' ')));break;
    case 'packet': print({folder:packet(args[0])});break;
    case 'run-start': print({run_id:startRun(args.join(' '))});break;
    case 'run-finish': finishRun(Number(args[0]),args[1],Number(args[2]),Number(args[3]),args.slice(4).join(' '));print({ok:true});break;
    default: throw Error('Comandos: import <arquivo>, list [status], get <id>, stats, events, runs, queue, claim <id>, notifications, notified <id>, submitted <id> <comprovante>, needs-action <id> <motivo>, failed <id> <motivo>, packet <id>, run-start [nota], run-finish <run_id> <completed|failed> <encontradas> <novas> [nota].');
  }
} catch(error) {console.error(`ERRO: ${error.message}`);process.exitCode=1;}
finally {close();}
