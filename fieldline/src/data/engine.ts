import { applyCommand, Conflict, optimistic, plan, type Action, type Command, type Model, type Snapshot } from '../domain/model';
import type { Storage } from './storage';
export interface Backend { commit(command: Command): Promise<Model | void>; subscribe(onModel: (model: Model) => void, onError: (error: Error) => void): () => void }
export class Engine {
  snapshot!: Snapshot; listeners = new Set<() => void>(); syncing = false; paused = false; error = ''; connected = false; unsubscribe=()=>{};
  constructor(public store: Storage, public mode: 'demo' | 'firebase', public backend?: Backend) {}
  get model() { return this.snapshot ? optimistic(this.snapshot.confirmed,this.snapshot.commands) : {}; }
  notify = () => { for (const listener of this.listeners) listener(); };
  async load(initial: Model) {
    this.snapshot = await this.store.change((s)=>s||{confirmed:initial,commands:[],demoServer:initial,receipts:[],actor:this.mode==='demo'?'Demo operator':''});
    if(this.backend) this.unsubscribe=this.backend.subscribe((confirmed)=>{ this.connected=true;this.store.change((s)=>({...s!,confirmed})).then((next)=>{this.snapshot=next;this.error='';this.notify();void this.flush();}).catch(e=>{this.error=String(e);this.notify();}); },(e)=>{this.error=e.message;this.connected=false;this.notify();});
    this.notify(); void this.flush();
  }
  async actor(name: string) { this.snapshot=await this.store.change(s=>({...s!,actor:name.trim()}));this.notify(); }
  async submit(action: Action, baseline?: Model) {
    // The IndexedDB transaction plans against the latest local state, not a stale component render.
    let submitted!: Command;
    this.snapshot=await this.store.change((s)=>{
      const command=plan(baseline || optimistic(s!.confirmed,s!.commands),action,s!.actor);
      submitted=command; return {...s!,commands:[...s!.commands,command]};
    });
    this.notify(); void this.flush(); return submitted;
  }
  async flush() {
    if(this.syncing||this.paused||(this.mode==='firebase'&&!navigator.onLine))return;
    const run=async()=>{
      this.syncing=true;this.notify();
      try {
        const saved=await this.store.read();if(!saved)return;
        const blocked=new Set<string>();
        for(const command of saved.commands){
          if(command.status==='conflict'||Object.keys(command.expected).some(id=>blocked.has(id))){Object.keys(command.expected).forEach(id=>blocked.add(id));continue;}
          try {
            if(this.mode==='demo'){
              this.snapshot=await this.store.change(s=>{
                const server=applyCommand(s!.demoServer,command,s!.receipts);
                return {...s!,demoServer:server,confirmed:server,receipts:[...new Set([...s!.receipts,command.id])],commands:s!.commands.filter(c=>c.id!==command.id)};
              });
            }else{
              await this.backend!.commit(command);
              // Durable removal happens only after acknowledged atomic server success.
              this.snapshot=await this.store.change(s=>({...s!,confirmed:applyCommand(s!.confirmed,{...command,expected:{},writes:command.writes.filter(e=>(s!.confirmed[e.id]?.rev??0)<=e.rev)},[]),commands:s!.commands.filter(c=>c.id!==command.id)}));
            }
          }catch(e){
            const message=e instanceof Error?e.message:String(e);
            this.snapshot=await this.store.change(s=>({...s!,confirmed:this.mode==='demo'?s!.demoServer:s!.confirmed,commands:s!.commands.map(c=>c.id===command.id?{...c,status:e instanceof Conflict?'conflict':'failed',error:message}:c)}));
            Object.keys(command.expected).forEach(id=>blocked.add(id));
          }
          this.notify();
        }
      }catch(e){this.error=e instanceof Error?e.message:String(e);}finally{this.syncing=false;this.notify();}
    };
    if(navigator.locks)await navigator.locks.request(`fieldline-flush-${this.mode}`,{ifAvailable:true},async lock=>{if(lock)await run();});else await run();
  }
  async discard(id: string){this.snapshot=await this.store.change(s=>({...s!,commands:s!.commands.filter(c=>c.id!==id)}));this.notify();}
  async simulateConflict(){
    if(this.mode!=='demo')return;
    this.paused=true;
    this.snapshot=await this.store.change(s=>{const command=s!.commands.find(c=>c.status==='pending');if(!command)throw new Error('Pause sync, make an edit, then simulate a server change.');const target=Object.keys(command.expected).find(id=>s!.demoServer[id]);if(!target)throw new Error('Choose an edit of an existing record.');return {...s!,demoServer:{...s!.demoServer,[target]:{...s!.demoServer[target],rev:s!.demoServer[target].rev+1}}};});
    this.paused=false;await this.flush();
  }
}
