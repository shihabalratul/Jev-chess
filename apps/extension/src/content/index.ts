import { loadSettings } from '../settings';
import { SessionRecorder } from '../logging/recorder';
import { UiRecovery } from '../execution/recovery';
import { recoveryResultSchema, type StepResponse } from '../../../../packages/shared/src';
import { migrateSettings, settingsSchema, message, type Settings, type SessionView } from '../../../../packages/shared/src';
import { BoardReader } from '../parsing/BoardReader';
import { MoveExecutor } from '../execution/MoveExecutor';
import { AutoPlayController } from '../controllers/AutoPlayController';
import { background, cancelBackground, getMetrics, setRequestContext, validateInputGuard } from './bridge';
import { manualSelect } from '../detection/manual';
const globalKey = '__jevChessContentLoaded';
const win = window as unknown as Record<string, unknown>;
if (!win[globalKey]) {
    win[globalKey] = true;
    void initialize();
}
async function initialize() {
    let settings: Settings = await loadSettings();
    const reader: BoardReader = new BoardReader(() => settings, (): boolean => !controller.initialized);
    const recorder=new SessionRecorder(async event=>{
        const response=await chrome.runtime.sendMessage({type:'LOG',event});
        if(!response?.ok)throw new Error(response?.error??'Log service unavailable');return response.data;
    });
    let recoveryProgress:SessionView['recoveryProgress'];
    const record=async(event:string,data:unknown)=>{
        await recorder.record(event,data,{turnId:controller?.view.turnId,...(data&&typeof data==='object'&&'actionId' in data?{actionId:String(data.actionId)}:{})});
        if(event.startsWith('recovery.')){
            const detail=data as {attempt?:number;result?:{action?:string}};
            recoveryProgress={attempt:(detail.attempt??((recoveryProgress?.attempt??1)-1))+1,activity:event==='recovery.start'||event==='recovery.evidence'?'Inspecting the interface':event==='recovery.proposal'?`Proposed action: ${detail.result?.action??'wait'}`:event==='recovery.input_intent'?'Applying the verified UI action':'Verifying the recovered interface'};
            if(['READING_BOARD','EXECUTING_MOVE','VERIFYING_MOVE','REQUESTING_DECISION'].includes(lastView.state)){lastView={...lastView,recoveryProgress};void chrome.runtime.sendMessage({type:'VIEW',view:lastView}).catch(()=>{});}
        }
    };
    const api=<T>(path:string,body:unknown,signal:AbortSignal)=>background<T>('API',{path,body,sessionId:recorder.sessionId,turnId:controller.view.turnId},signal);
    const executor:MoveExecutor = new MoveExecutor(() => reader.region(), () => settings,{board:()=>reader.element,fen:()=>controller.view.fen,record,recover:(reason,signal,promotion)=>recovery.recover(reason,signal,promotion)});
    const recovery:UiRecovery=new UiRecovery(()=>reader.element,()=>reader.region(),(target,signal,guard)=>executor.clickTarget(target,signal,guard),record,async(input,signal)=>recoveryResultSchema.parse(await api('/api/recover-ui',input,signal)));
    let lastView: SessionView = { state: 'IDLE', running: false, website: location.origin, debug: {} };
    const controller: AutoPlayController = new AutoPlayController({ read: async s => {try{const result=await reader.read(s);await record('board.observed',{observation:result.observation,seedFen:result.seedFen,seedPgn:result.seedPgn,recognition:result.recognition,debug:reader.debug});return result;}catch(error){await record('board.error',{error,debug:reader.debug});throw error;}}, choose: (input, s) => api('/api/choose-move',input,s), chooseStep:(input,s)=>api<StepResponse>('/api/choose-move/step',input,s), record, recover:async(reason,s)=>{const result=await recovery.recover(reason,s);if(result==='redetect')reader.detect();}, recoveryVerified:()=>{recovery.verified();recoveryProgress=undefined;}, execute: (uci, orientation, s,checkpoint) => executor.execute(uci, orientation, s,checkpoint), cancel: cancelBackground, onView: view => { let board; try {
            board = reader.region();
        }
        catch { /* Not detected yet. */ } lastView = { ...view, board, recoveryProgress:['IDLE','PAUSED','ERROR','FINISHED'].includes(view.state)?undefined:recoveryProgress, debug: { ...view.debug, ...reader.debug, metrics: getMetrics(), logging:recorder.status } }; void record('session.view',{...lastView,debug:undefined}).catch(()=>{}); void chrome.runtime.sendMessage({ type: 'VIEW', view: lastView }).catch(() => { }); } }, settings, location.origin);
    setRequestContext(()=>({sessionId:recorder.sessionId,turnId:controller.view.turnId}));
    if(settings.colorMigrationNotice)void record('settings.color_migrated',{from:'legacy-white',to:'auto',notice:'Playing color now follows the observed board bottom; manual overrides are available.'}).catch(()=>{});
    void record('session.start',{version:'1.3.0',website:location.origin,settings}).catch(error=>{lastView.error=message(error);});
    let selection: AbortController | undefined;
    chrome.runtime.onMessage.addListener((raw, sender, reply) => {
        if(sender.id===chrome.runtime.id&&raw.type==='INPUT_CHECK'){try{validateInputGuard(String(raw.guardId));reply({ok:true});}catch(error){reply({ok:false,error:message(error)});}return;}
        if (sender.id !== chrome.runtime.id || raw.type !== 'COMMAND')
            return;
        const command = raw.command;
        if(command!=='STATUS')void record('session.command',{command}).catch(()=>{});
        if (command === 'STATUS') {
            void chrome.runtime.sendMessage({type:'LOG_STATUS'}).then(response=>{if(response?.ok){recorder.status={...recorder.status,...response.data,path:`${response.data.logRoot??'logs'}/${recorder.sessionId}/`};lastView.debug.logging=recorder.status;}reply({ok:true,view:lastView});}).catch(()=>reply({ok:true,view:lastView}));
            return true;
        }
        if (command === 'STOP') {
            selection?.abort();
            controller.stop();
            reply({ ok: true, view: lastView });
            return;
        }
        void (async () => {
            if (command === 'CONFIGURE') {
                selection?.abort();
                settings = settingsSchema.parse(raw.settings);
                controller.configure(settings);
                reader.invalidate();
                await record('settings.changed',{settings});
            }
            else if (command === 'RESET') {
                selection?.abort();
                controller.reset();
                reader.invalidate();
            }
            else if (command === 'DETECT') {
                controller.stop();
                lastView = { ...lastView, state: 'DETECTING' };
                void chrome.runtime.sendMessage({ type: 'VIEW', view: lastView }).catch(() => { });
                reader.detect();
                await controller.inspect();
            }
            else if (command === 'SELECT') {
                controller.stop();
                selection = new AbortController();
                reader.select(await manualSelect(selection.signal));
                selection = undefined;
                await controller.inspect();
            }
            else if (command === 'PARSE')
                await controller.inspect();
            else if (command === 'CONFIRM_NEW_GAME') {
                selection?.abort();
                if (!await controller.confirmNewGame())
                    return { ok: false, error: controller.view.error ?? 'New game was not confirmed. Stop the current operation and retry.', view: lastView };
            }
            else if (command === 'ASK')
                await controller.ask();
            else if (command === 'PLAY')
                await controller.play();
            else if (command === 'START') {
                void controller.start();
            }
            else
                throw new Error('Unknown command');
            return { ok: true, view: lastView };
        })().then(reply).catch(error => reply({ ok: false, error: message(error), view: lastView }));
        return true;
    });
    const observer = new MutationObserver(() => { if (reader.element && !reader.element.isConnected)
        controller.stop(); });
    observer.observe(document.documentElement, { subtree: true, childList: true });
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) {
        settings = migrateSettings(changes.settings.newValue);
        selection?.abort();
        controller.configure(settings);
        reader.invalidate();
    } });
    // Cover configuration writes that happened while initial readers were awaiting storage.
    void loadSettings().then(latest=>{if(JSON.stringify(latest)!==JSON.stringify(settings)){settings=latest;selection?.abort();controller.configure(settings);reader.invalidate();}}).catch(error=>{controller.stop();lastView.error=message(error);});
    window.addEventListener('pagehide', () => { void record('session.navigation',{website:location.origin}).catch(()=>{}); selection?.abort(); controller.stop(); observer.disconnect(); }, { once: true });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && controller.view.running)
        controller.stop(); });
}
