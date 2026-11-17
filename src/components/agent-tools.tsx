"use client";

import { Check, ChevronRight, CircleAlert, CirclePause, LoaderCircle, Terminal } from "lucide-react";
import type { AnalysisStep } from "@/lib/analysis-run";
import type { AiTurn } from "./use-ai-conversation";

const states = {
  running: { label: "执行中", Icon: LoaderCircle },
  completed: { label: "已完成", Icon: Check },
  failed: { label: "失败", Icon: CircleAlert },
  stopped: { label: "已停止", Icon: CirclePause },
};

function toolAnchor(turnId: string, index: number) {
  return `agent-tool-${turnId}-${index}`;
}

export function ToolCalls({ turn }: { turn: AiTurn }) {
  if (!turn.steps.length) return null;
  return (
    <div className="agent-tools" aria-label="工具执行记录">
      {turn.steps.map((step, index) => {
        const tool = step.tool;
        const id = toolAnchor(turn.id, index);
        if (!tool) return <div className="agent-tool-note" id={id} key={id}>
          <Check size={14} aria-hidden="true" /><strong>{step.name}</strong><span>{step.detail}</span>
        </div>;
        const { label, Icon } = states[tool.status];
        return <details className="agent-tool" data-status={tool.status} id={id} key={id}>
          <summary>
            <span className="agent-tool-icon"><Icon size={15} className={tool.status === "running" ? "spinning" : ""} aria-hidden="true" /></span>
            <span className="agent-tool-title"><strong>{step.name}</strong><code>{tool.key}</code><span>{step.detail}</span></span>
            <span className="agent-tool-state"><span>{label}</span>{tool.durationMs !== undefined && <small>{tool.durationMs} ms</small>}</span>
            <ChevronRight className="agent-tool-chevron" size={15} aria-hidden="true" />
          </summary>
          <div className="agent-tool-data">
            <section><h3>调用参数</h3><pre>{tool.input}</pre></section>
            {tool.output !== undefined && <section><h3>返回结果</h3><pre>{tool.output}</pre></section>}
          </div>
        </details>;
      })}
    </div>
  );
}

export function ToolInspectorList({ turn, inspect }: { turn: AiTurn; inspect: (id: string) => void }) {
  const calls = turn.steps.flatMap((step: AnalysisStep, index) => step.tool ? [{ step, tool: step.tool, id: toolAnchor(turn.id, index) }] : []);
  if (!calls.length) return null;
  return (
    <div className="agent-inspector-calls">
      <h3>本轮工具</h3>
      {calls.map(({ step, tool, id }) => <button className="agent-inspector-link" type="button" key={id} onClick={() => inspect(id)}>
        <Terminal size={15} aria-hidden="true" /><span>{step.name}</span><small>{states[tool.status].label}</small>
      </button>)}
    </div>
  );
}
