import { squareCenter, rectOf, parseGeneric, domTransitionReason, interfaceElement, renderedElement, orientationOf } from '../../../../packages/board-detection/src';
import { delay, type Rect, type Orientation, type Settings } from '../../../../packages/shared/src';
import { collectRecoveryTargets, validateRecoveryAction } from './recovery';
import { ChessStateManager, placementFromPieces, piecesFromFen } from '../../../../packages/chess-core/src';
import { guardedInput } from '../content/bridge';
function pointer(type: string, p: {
    x: number;
    y: number;
}, buttons = 0, guard?:()=>void) { guard?.();const target = document.elementFromPoint(p.x, p.y); if (!target)
    throw new Error('Move coordinates are outside viewport'); target.dispatchEvent(new PointerEvent('pointer' + type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true })); if (type === 'down' || type === 'up' || type === 'move')
    {guard?.();target.dispatchEvent(new MouseEvent('mouse' + type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0, buttons }));} }
function click(p:{x:number;y:number},guard?:()=>void,allowInterface=false){
    guard?.();const target=document.elementFromPoint(p.x,p.y);
    pointer('down',p,1,guard);pointer('up',p,0,guard);
    // A completed mouseup may open a promotion picker. Never send the trailing
    // click to a different element that appeared as a result of that input.
    if(target?.isConnected&&document.elementFromPoint(p.x,p.y)===target&&(allowInterface||!interfaceElement(target)))
        target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:p.x,clientY:p.y,button:0}));
}
export class MoveExecutor {
    constructor(private region: () => Rect, private settings: () => Settings, private options: {
        board?:()=>Element|undefined;fen?:()=>string|undefined;
        recover?:(reason:string,signal:AbortSignal,promotion?:'q'|'r'|'b'|'n')=>Promise<unknown>;
        record?:(event:string,data:unknown)=>Promise<void>;
    } = {}) { }
    async clickTarget(target:Element,signal:AbortSignal,guard?:()=>void){
        const actionId=crypto.randomUUID(),before=rectOf(target);
        await this.options.record?.('input.target_intent',{actionId,rect:before,label:target.getAttribute('aria-label')??target.textContent?.slice(0,100)});
        signal.throwIfAborted();guard?.();const current=rectOf(target);
        if(!target.isConnected||Math.abs(current.x-before.x)>2||Math.abs(current.y-before.y)>2)throw new Error('Input target changed');
        const p={x:current.x+current.width/2,y:current.y+current.height/2};
        try{
        if(this.settings().input.startsWith('debugger'))await guardedInput({from:p,to:p,drag:false},()=>{signal.throwIfAborted();guard?.();if(!target.isConnected)throw new Error('Recovery input target changed');const hit=document.elementFromPoint(p.x,p.y);if(!hit||!target.contains(hit)&&target!==hit)throw new Error('Recovery target became obstructed');},signal);else click(p,guard,true);
        }catch(error){
            signal.throwIfAborted();
            // A picker/control can consume itself on mousedown. Suppress all
            // remaining events; the caller must still verify the resulting UI.
            if(target.isConnected&&renderedElement(target))throw error;
            await this.options.record?.('input.target_consumed',{actionId,detached:!target.isConnected,visible:renderedElement(target),verified:false});
        }
        await this.options.record?.('input.target_outcome',{actionId,rect:current,verified:false});
    }
    async execute(uci: string, orientation: Orientation, signal: AbortSignal, checkpoint?:()=>Promise<void>) {
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))
            throw new Error('Invalid UCI');
        const actionId=crypto.randomUUID(),board=this.options.board?.();
        const fen=this.options.fen?.();
        const expected=fen?new ChessStateManager(fen).expected(uci):undefined;
        const r = this.region();
        const connected=()=>{if(board&&(!board.isConnected||this.options.board?.()!==board))throw new Error('Board changed during move execution');};
        connected();
        if (r.x < 0 || r.y < 0 || r.x + r.width > innerWidth || r.y + r.height > innerHeight)
            throw new Error('Keep the whole board visible before moving');
        const from = squareCenter(uci.slice(0, 2), r, orientation), to = squareCenter(uci.slice(2, 4), r, orientation);
        signal.throwIfAborted();
        const input = this.settings().input;
        const obscured=()=>board&&[from,to].some(p=>{const hit=document.elementFromPoint(p.x,p.y);return !hit||!board.contains(hit)&&hit!==board||interfaceElement(hit);});
        let interruptedByObstruction=false;
        const guard=()=>{signal.throwIfAborted();connected();const current=this.region();if(['x','y','width','height'].some(key=>Math.abs(current[key as keyof Rect]-r[key as keyof Rect])>2))throw new Error('Board geometry changed during input transaction');const currentOrientation=board?orientationOf(board):null;if(currentOrientation&&currentOrientation!==orientation)throw new Error('Board orientation changed during input transaction');if(obscured()){interruptedByObstruction=true;throw new Error('Board input target became obstructed; transaction remains unconfirmed');}};
        if(board){
            if(obscured()){
                if(!this.options.recover)throw new Error('Board input is obstructed');
                await this.options.recover('Board input is obstructed before any move input',signal);connected();
                const now=this.region();if(Math.abs(now.x-r.x)>2||Math.abs(now.y-r.y)>2||Math.abs(now.width-r.width)>2||obscured())throw new Error('Board input remains obstructed or geometry changed');
                if(fen){const observed=parseGeneric(board,orientation);if(observed?placementFromPieces(observed.pieces)!==fen.split(' ')[0]:!checkpoint)throw new Error('Position changed or an independent checkpoint is unavailable after obstruction recovery; decision discarded');}
            }
        }
        await this.options.record?.('input.move_intent',{actionId,uci,fen,expected,orientation,input,from,to,rect:r});
        await checkpoint?.();
        signal.throwIfAborted();connected();
        if(board&&fen){const now=parseGeneric(board,orientation);if(now&&placementFromPieces(now.pieces)!==fen.split(' ')[0])throw new Error('Position changed before browser input');}
        const currentRegion=this.region();if(Math.abs(currentRegion.x-r.x)>2||Math.abs(currentRegion.y-r.y)>2||Math.abs(currentRegion.width-r.width)>2||Math.abs(currentRegion.height-r.height)>2)throw new Error('Board geometry changed before browser input');
        try{
        guard();
        if (input.startsWith('debugger'))
            await guardedInput({from,to,drag:input.endsWith('drag')},guard,signal);
        else if (input === 'drag') {
            pointer('down', from, 1,guard);
            try {
                for (let i = 1; i <= 8; i++) {
                    signal.throwIfAborted();
                    guard();pointer('move', { x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 }, 1,guard);
                    await delay(16, signal);
                }
                guard();pointer('up', to,0,guard);
            }
            catch (e) {
                if(!obscured())pointer('up', from);
                throw e;
            }
        }
        else {
            click(from,guard);
            await delay(70, signal);
            signal.throwIfAborted();
            guard();click(to,guard);
        }
        }catch(error){
            signal.throwIfAborted();connected();
            // Some public interfaces open their picker on destination mousedown.
            // Continue only when the visible board exactly proves that pawn's
            // pending promotion, and never replay the source/destination input.
            const observation=board?parseGeneric(board,orientation):undefined;
            const key=(pieces:{square:string;piece:string}[])=>pieces.map(p=>`${p.square}:${p.piece}`).sort().join('|');
            const pending=expected?piecesFromFen(expected).map(p=>p.square===uci.slice(2,4)?{...p,piece:fen!.split(' ')[1]==='w'?'P':'p'}:p):[];
            if(!interruptedByObstruction||!uci[4]||!board||!observation||key(observation.pieces)!==key(pending)||!collectRecoveryTargets(board).some(t=>t.evidence.kind==='promotion'))throw error;
            await this.options.record?.('input.pending_promotion',{actionId,uci,observation,remainingGestureSuppressed:true});
        }
        await this.options.record?.('input.move_outcome',{actionId,uci,verified:false});
        if (uci[4]) {
            const requested=uci[4] as 'q'|'r'|'b'|'n';
            const until=Date.now()+5000;
            let recovered=false;
            while(Date.now()<until){
                signal.throwIfAborted();connected();
                if(board&&expected){
                    const observation=parseGeneric(board,orientation);
                    if(observation&&!domTransitionReason(board,orientation)){
                        try{const placement=placementFromPieces(observation.pieces);if(placement===expected.split(' ')[0])return;
                            const reply=new ChessStateManager(expected);if(reply.observe(observation))return;
                        }catch{/* Pending promotion or animation is not a complete position. */}
                    }
                }
                const target=board?collectRecoveryTargets(board).filter(t=>t.evidence.kind==='promotion'&&t.evidence.piece===requested):[];
                if(target.length===1){await this.clickTarget(target[0].element,signal,()=>{validateRecoveryAction({action:'selectPromotion',targetId:target[0].evidence.id,reason:'Jev requested promotion'},target,board!,requested);});return;}
                if(target.length>1)throw new Error('Ambiguous promotion interface; no piece selected');
                if(!recovered&&this.options.recover&&Date.now()>until-4000){
                    recovered=true;await this.options.recover('Promotion picker is unfamiliar or delayed',signal,requested);return;
                }
                await delay(80,signal);
            }
            throw new Error('Promotion interface unsupported or unresolved; original move will not be replayed');
        }
    }
}
