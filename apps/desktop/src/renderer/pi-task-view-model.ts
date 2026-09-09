import type { PiTask } from "@ai-corporation/protocols";

/**
 * 轮询请求可能乱序返回。只接受事件更多或更新时间更新的任务，避免旧界面
 * 把已经生效的授权重新显示成“仍待授权”。
 */
export function preferFresherPiTask(
  current: PiTask | undefined,
  incoming: PiTask,
): PiTask {
  if (current === undefined || current.id !== incoming.id) return incoming;
  const currentSequence = current.events.at(-1)?.sequence ?? 0;
  const incomingSequence = incoming.events.at(-1)?.sequence ?? 0;
  if (currentSequence !== incomingSequence) {
    return incomingSequence > currentSequence ? incoming : current;
  }
  return Date.parse(incoming.updatedAt) >= Date.parse(current.updatedAt)
    ? incoming
    : current;
}
