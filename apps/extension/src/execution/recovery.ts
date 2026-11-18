import { rectOf, pieceToken, renderedElement, extractDom, formRedactions } from '../../../../packages/board-detection/src';
import { delay, deadlineSignal, recoveryResultSchema, type RecoveryRequest, type RecoveryResult, type RecoveryTarget, type Rect } from '../../../../packages/shared/src';
import { background } from '../content/bridge';
export interface LocalTarget {element:Element;root:Element;evidence:RecoveryTarget;}
const forbidden=/accept|agree|allow|permission|sign.?in|log.?in|password|buy|purchase|subscribe|resign|offer.draw|new.game|rematch|settings|delete|submit|download|cookie|privacy|account|security|billing|payment|checkout|subscription|log.?out|sessions/i;
const dismissal=/^(?:close|dismiss|cancel|skip|not now|later|×|✕|✖|x)(?:\b|$)/i;
function intersects(a:Rect,b:Rect){return a.x<=b.x+b.width+20&&a.x+a.width>=b.x-20&&a.y<=b.y+b.height+20&&a.y+a.height>=b.y-20;}
function rootsFor(board:Element){
    const roots=[...document.querySelectorAll('[role="dialog"],dialog,[aria-modal="true"],[data-promotion-picker],[class*="promotion"],[class*="modal"],[class*="popup"]')].filter(e=>renderedElement(e)&&!e.contains(board)&&intersects(rectOf(e),rectOf(board)));
    const b=rectOf(board),top=document.elementFromPoint?.(b.x+b.width/2,b.y+b.height/2);
    for(let node=top;node&&node!==document.body;node=node.parentElement){
        if(!board.contains(node)&&!node.contains(board)&&/^(fixed|absolute)$/.test(getComputedStyle(node).position)&&intersects(rectOf(node),b)&&!roots.includes(node))roots.push(node);
    }
    return roots;
}
export function collectRecoveryTargets(board:Element):LocalTarget[]{
    const targets:LocalTarget[]=[],seen=new Set<Element>();
    for(const root of rootsFor(board)){
        const promotion=/promot/i.test(root.getAttribute('aria-label')??'') || /promot/i.test(root.className.toString()) || root.matches('[data-promotion-picker]') || !!root.querySelector('[data-promotion]');
        const elements=[...root.querySelectorAll('*')].filter(e=>e.matches('button,[role="button"],[data-promotion],img')||!!pieceToken(e));
        for(const element of elements){
            if(seen.has(element)||!renderedElement(element))continue;
            const r=rectOf(element);if(r.width<=0||r.height<=0||!intersects(r,rectOf(root)))continue;
            const label=(element.getAttribute('aria-label')??element.getAttribute('alt')??element.textContent??'').trim().slice(0,160);
            if(forbidden.test(label)||!promotion&&!dismissal.test(label))continue;
            let piece=element.getAttribute('data-promotion')??pieceToken(element)?.toLowerCase();
            if(!piece){const match=/\b(queen|rook|bishop|knight)\b/i.exec(label);if(match)piece=({queen:'q',rook:'r',bishop:'b',knight:'n'} as Record<string,string>)[match[1].toLowerCase()];}
            if(piece&&!/^[qrbn]$/.test(piece))piece=undefined;
            seen.add(element);
            targets.push({element,root,evidence:{id:`target-${targets.length}`,rect:r,label,kind:promotion?'promotion':'dismiss',...(piece?{piece:piece as 'q'|'r'|'b'|'n'}:{})}});
            if(targets.length===64)return targets;
        }
    }
    return targets;
}
export function validateRecoveryAction(result:RecoveryResult,targets:LocalTarget[],board:Element,requestedPromotion?:string):Element|undefined{
    if(!board.isConnected)throw new Error('Recovery board changed');
    if(result.action==='finished')throw new Error('Finished requires independently verified terminal game state');
    if(['wait','redetect','blocked'].includes(result.action))return;
    const target=targets.find(t=>t.evidence.id===result.targetId);
    if(!target||!target.element.isConnected||!target.root.contains(target.element)||!renderedElement(target.element)||forbidden.test(target.evidence.label))throw new Error('Recovery target changed or is unsupported');
    const fresh=collectRecoveryTargets(board).find(t=>t.element===target.element && t.root===target.root);
    if(!fresh||fresh.evidence.kind!==target.evidence.kind||fresh.evidence.piece!==target.evidence.piece||fresh.evidence.label!==target.evidence.label)throw new Error('Recovery target piece or label changed');
    const current=rectOf(target.element),old=target.evidence.rect;
    if(!intersects(rectOf(target.root),rectOf(board))||!intersects(current,rectOf(target.root))||current.x<0||current.y<0||current.x+current.width>innerWidth||current.y+current.height>innerHeight||Math.abs(current.x-old.x)>2||Math.abs(current.y-old.y)>2||Math.abs(current.width-old.width)>2||Math.abs(current.height-old.height)>2)throw new Error('Recovery target geometry changed');
    if(result.action==='selectPromotion'&&(!requestedPromotion||target.evidence.kind!=='promotion'||target.evidence.piece!==requestedPromotion))throw new Error('Recovery promotion piece does not match Jev choice');
    if(result.action==='dismiss'&&target.evidence.kind!=='dismiss')throw new Error('Cannot dismiss by clicking a promotion option');
    const hit=document.elementFromPoint?.(current.x+current.width/2,current.y+current.height/2);
    if(hit&&hit!==target.element&&!target.element.contains(hit))throw new Error('Recovery target is obstructed');
    return target.element;
}
export class UiRecovery {
    private incident?:{started:number;attempts:number;failures:Set<string>};
    verified(){this.incident=undefined;}
    constructor(private board:()=>Element|undefined,private region:()=>Rect,private click:(element:Element,signal:AbortSignal,guard?:()=>void)=>Promise<void>,private record:(event:string,data:unknown)=>Promise<void>,private api:(input:RecoveryRequest,signal:AbortSignal)=>Promise<RecoveryResult> = (input,signal)=>background('API',{path:'/api/recover-ui',body:input},signal)){}
    async recover(reason:string,signal:AbortSignal,requestedPromotion?:'q'|'r'|'b'|'n'):Promise<'retry'|'redetect'>{
        const incident=this.incident??={started:Date.now(),attempts:0,failures:new Set<string>()};
        const remaining=20000-(Date.now()-incident.started);
        if(remaining<=0||incident.attempts>=3)throw new Error('UI recovery attempt or time limit reached');
        const joined=deadlineSignal(signal,remaining),board=this.board();
        if(!board)throw new Error('Visual recovery requires an identified board');
        const failures=incident.failures;
        for(;incident.attempts<3;){
            const attempt=incident.attempts++;
            joined.throwIfAborted();if(this.board()!==board||!board.isConnected)throw new Error('Board changed during recovery');
            await this.record('recovery.start',{attempt,reason});joined.throwIfAborted();
            const targets=collectRecoveryTargets(board),r=this.region();
            const left=Math.max(0,Math.min(r.x-120,...targets.map(t=>t.evidence.rect.x-20))),top=Math.max(0,Math.min(r.y-120,...targets.map(t=>t.evidence.rect.y-20)));
            const right=Math.min(innerWidth,Math.max(r.x+r.width+120,...targets.map(t=>t.evidence.rect.x+t.evidence.rect.width+20))),bottom=Math.min(innerHeight,Math.max(r.y+r.height+120,...targets.map(t=>t.evidence.rect.y+t.evidence.rect.height+20)));
            const expanded={x:left,y:top,width:right-left,height:bottom-top};
            const image=await background<string>('CAPTURE',{rect:expanded,redactions:formRedactions(expanded),viewport:{width:innerWidth,height:innerHeight}},joined);
            const input:RecoveryRequest={image,dom:JSON.stringify({board:JSON.parse(extractDom(board)),overlays:targets.map(t=>({target:t.evidence,containerRole:t.root.getAttribute('role'),containerLabel:t.root.getAttribute('aria-label')}))}).slice(0,100000),board:r,captureRect:expanded,targets:targets.map(t=>t.evidence),reason:reason.slice(0,500),requestedPromotion};
            await this.record('recovery.evidence',{attempt,input});joined.throwIfAborted();
            const result=recoveryResultSchema.parse(await this.api(input,joined));
            await this.record('recovery.proposal',{attempt,result});joined.throwIfAborted();
            if(this.board()!==board)throw new Error('Board changed during recovery');
            if(result.action==='blocked')throw new Error('UI recovery blocked: '+result.reason);
            const key=JSON.stringify({action:result.action,targetId:result.targetId,targets:input.targets});
            if(failures.has(key)&&result.action!=='wait')throw new Error('Repeated identical UI recovery failure');
            failures.add(key);
            const target=validateRecoveryAction(result,targets,board,requestedPromotion);
            if(result.action==='redetect'){if(requestedPromotion)throw new Error('Cannot change board during promotion');return 'redetect';}
            if(target){await this.record('recovery.input_intent',{result,target:rectOf(target)});joined.throwIfAborted();await this.click(target,joined,()=>{validateRecoveryAction(result,targets,board,requestedPromotion);});await this.record('recovery.input_outcome',{result,attempt,verified:false});return 'retry';}
            await delay(300,joined);
        }
        throw new Error('UI recovery attempt limit reached');
    }
}
