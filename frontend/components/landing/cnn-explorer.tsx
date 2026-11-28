"use client";

import { useMemo, useState } from "react";

import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LayerInfo } from "@/types/api";

/*
 * The trained network, layer by layer. Shapes and parameter counts come from the running model
 * (/api/model/status). If the backend is away, the same values from backend/saved_models/model_config.json
 * are used and the source line says so.
 */

// shortcut: copied from backend/saved_models/model_config.json; update it when the model is retrained with a new architecture.
const CONFIG_LAYERS: LayerInfo[] = [
  { name: "views", type: "InputLayer", output_shape: [256, 2], params: 0 },
  { name: "conv1", type: "Conv1D", output_shape: [256, 32], params: 352 },
  { name: "bn1", type: "BatchNormalization", output_shape: [256, 32], params: 128 },
  { name: "relu1", type: "ReLU", output_shape: [256, 32], params: 0 },
  { name: "pool1", type: "MaxPooling1D", output_shape: [128, 32], params: 0 },
  { name: "conv2", type: "Conv1D", output_shape: [128, 64], params: 10304 },
  { name: "bn2", type: "BatchNormalization", output_shape: [128, 64], params: 256 },
  { name: "relu2", type: "ReLU", output_shape: [128, 64], params: 0 },
  { name: "pool2", type: "MaxPooling1D", output_shape: [64, 64], params: 0 },
  { name: "conv3", type: "Conv1D", output_shape: [64, 128], params: 24704 },
  { name: "bn3", type: "BatchNormalization", output_shape: [64, 128], params: 512 },
  { name: "relu3", type: "ReLU", output_shape: [64, 128], params: 0 },
  { name: "gap", type: "GlobalAveragePooling1D", output_shape: [128], params: 0 },
  { name: "dense", type: "Dense", output_shape: [64], params: 8256 },
  { name: "dropout", type: "Dropout", output_shape: [64], params: 0 },
  { name: "probabilities", type: "Dense", output_shape: [2], params: 130 },
];

/** Blocks shown in the diagram; normalisation and activation layers fold into their convolution. */
const BLOCKS: { id: string; title: string; members: string[]; role: string; detail: string }[] = [
  { id: "views", title: "Input", members: ["views"], role: "Two views of one signal, 256 bins each",
    detail: "Channel 1 is the global view (the whole orbit, folded); channel 2 the local view (a close-up of the transit)." },
  { id: "c1", title: "Conv 1", members: ["conv1", "bn1", "relu1", "pool1"], role: "Short local shapes: ingress and egress",
    detail: "32 filters of width 5, batch normalisation, ReLU, then max pooling halves the length." },
  { id: "c2", title: "Conv 2", members: ["conv2", "bn2", "relu2", "pool2"], role: "Combines them into dip profiles",
    detail: "64 filters of width 5 over the 32 maps below, then pooling again." },
  { id: "c3", title: "Conv 3", members: ["conv3", "bn3", "relu3"], role: "Whole-signal patterns, such as a secondary eclipse",
    detail: "128 filters of width 3. Each now sees a wide stretch of the original curve." },
  { id: "gap", title: "Pool", members: ["gap"], role: "Position-independent summary",
    detail: "Global average pooling turns 64 x 128 maps into 128 numbers, wherever the feature appeared." },
  { id: "dense", title: "Dense", members: ["dense", "dropout"], role: "Decision features, regularised",
    detail: "64 units with ReLU; dropout switches some off at random during training to prevent memorising." },
  { id: "out", title: "Output", members: ["probabilities"], role: "CONFIRMED vs FALSE POSITIVE",
    detail: "A softmax over two classes. The score is a probability-like number, not a discovery." },
];

export function CnnExplorer() {
  const { data } = useApi(api.modelStatus);
  const live = data?.architecture?.layers?.length ? data.architecture.layers : null;
  const layers = live ?? CONFIG_LAYERS;
  const [sel, setSel] = useState("c1");

  const blocks = useMemo(() => BLOCKS.map((b) => {
    const ls = b.members.map((m) => layers.find((l) => l.name === m)).filter(Boolean) as LayerInfo[];
    const out = ls.at(-1)?.output_shape ?? [];
    const params = ls.reduce((s, l) => s + l.params, 0);
    const len = out.length === 2 ? (out[0] ?? 1) : 1;
    const ch = (out.length === 2 ? out[1] : out[0]) ?? 1;
    return { ...b, out, params, len, ch, layers: ls };
  }), [layers]);

  const total = layers.reduce((s, l) => s + l.params, 0);
  const current = blocks.find((b) => b.id === sel)!;

  // diagram geometry: height follows sequence length, depth follows channel count (log scale)
  const W = 760, H = 260, gap = 18;
  const colW = (W - gap * (blocks.length - 1)) / blocks.length;

  return (
    <div className="glass rounded-2xl p-4 sm:p-6">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="cnn-diagram h-auto w-full min-w-[640px]" role="group" aria-label="The 1D CNN, layer by layer. Choose a block for details.">
          <defs>
            <linearGradient id="cnn-face" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.22)" /><stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
            </linearGradient>
          </defs>
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,0.08)" />
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#f3b45a" strokeWidth="1.5" className="cnn-pulse" pathLength={1} />
          {blocks.map((b, i) => {
            const x = i * (colW + gap);
            const h = b.out.length === 2 ? 40 + (b.len / 256) * 170 : 26 + Math.log2(b.ch) * 7;
            const depth = 4 + Math.log2(b.ch) * 3.2;
            const y = H / 2 - h / 2;
            const on = b.id === sel;
            return (
              <g key={b.id}>
              <text aria-hidden="true" x={x + (colW - depth - 4) / 2} y={y - depth - 8} fill="#a3a6ad" fontSize="10" textAnchor="middle"
                    fontFamily="var(--font-geist-mono), monospace">{b.out.join(" x ")}</text>
              <g role="button" tabIndex={0} aria-pressed={on} aria-label={b.title}
                 onClick={() => setSel(b.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(b.id); } }}
                 className="cursor-pointer outline-none">
                {/* a slab with depth: back face, then the front */}
                <rect x={x + depth} y={y - depth} width={colW - depth - 4} height={h} rx="4"
                      fill="rgba(255,255,255,0.03)" stroke={on ? "rgba(243,180,90,0.6)" : "rgba(255,255,255,0.12)"} />
                <rect x={x} y={y} width={colW - depth - 4} height={h} rx="4" fill="url(#cnn-face)"
                      stroke={on ? "#f3b45a" : "rgba(255,255,255,0.28)"} strokeWidth={on ? 1.6 : 1} className="cnn-block" />
                <text x={x + (colW - depth - 4) / 2} y={y + h + 18} fill={on ? "#f2f3f5" : "#a3a6ad"} fontSize="12" textAnchor="middle"
                      fontFamily="var(--font-geist-sans), sans-serif">{b.title}</text>
              </g>
              </g>
            );
          })}
        </svg>
      </div>

      <div id="cnn-detail" className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-[1fr_1.2fr]" aria-live="polite">
        <div>
          <p className="eyebrow">{current.title}</p>
          <p className="mt-1 text-lg">{current.role}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.detail}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Output shape</dt><dd className="data text-right">{current.out.join(" x ") || "n/a"}</dd>
          <dt className="text-muted-foreground">Parameters in block</dt><dd className="data text-right">{fmtInt(current.params)}</dd>
          <dt className="text-muted-foreground">Layers</dt><dd className="data text-right text-xs">{current.layers.map((l) => l.type.replace("Normalization", "Norm")).join(", ")}</dd>
          <dt className="text-muted-foreground">Whole network</dt><dd className="data text-right">{fmtInt(total)} parameters</dd>
        </dl>
      </div>
      <p className={cn("mt-4 text-xs text-muted-foreground")}>
        {live ? "Shapes and parameter counts read from the running model." : "Shapes and parameter counts from the saved model config (backend not reachable)."}
      </p>
    </div>
  );
}
