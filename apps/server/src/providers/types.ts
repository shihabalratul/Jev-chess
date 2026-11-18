import type { ParseRequest, Observation, ParserRule, ChooseRequest, Decision, StageTrace, StepResponse, RecoveryRequest, RecoveryResult } from '../../../../packages/shared/src';
export interface Provider {
    parse(input: ParseRequest, signal?: AbortSignal): Promise<Observation>;
    discover(input: ParseRequest, signal?: AbortSignal): Promise<ParserRule>;
    chooseStep?(input: ChooseRequest, trace: StageTrace[], signal?: AbortSignal): Promise<StepResponse>;
    recover?(input: RecoveryRequest, signal?: AbortSignal): Promise<RecoveryResult>;
    choose(input: ChooseRequest, signal?: AbortSignal): Promise<Decision>;
}
