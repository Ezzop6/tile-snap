import { arcControlPoint } from "../../core/pointGraph/render.js";
import { SLOT_SIZE, SLOT_SCALE, HIGHLIGHT_COLOR, slotOrigin } from "./constants.js";

export function drawSelectionOverlay(ctx, template, slotGraphs, selected) {
  if (!selected) return;
  const slot = template.slots.find((s) => s.index === selected.slotIndex);
  if (!slot) return;
  const graph = slotGraphs.get(slot.index);
  if (!graph) return;

  ctx.save();
  ctx.strokeStyle = HIGHLIGHT_COLOR;
  ctx.fillStyle   = HIGHLIGHT_COLOR;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";

  switch (selected.kind) {
    case "slot":       drawSlotHighlight(ctx, slot); break;
    case "point":      drawPointHighlight(ctx, graph, slot, selected); break;
    case "connection": drawConnHighlight(ctx, graph, slot, selected); break;
  }
  ctx.restore();
}

function drawSlotHighlight(ctx, slot) {
  const o = slotOrigin(slot);
  ctx.lineWidth = 2;
  ctx.strokeRect(o.x + 1, o.y + 1, SLOT_SIZE - 2, SLOT_SIZE - 2);
}

function drawPointHighlight(ctx, graph, slot, selected) {
  const p = graph.points.get(selected.entity.id);
  if (!p) return;
  const o = slotOrigin(slot);
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(SLOT_SCALE, SLOT_SCALE);
  ctx.lineWidth = 2 / SLOT_SCALE;
  ctx.beginPath();
  ctx.arc(p.pos.x, p.pos.y, 7 / SLOT_SCALE, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.pos.x, p.pos.y, 2 / SLOT_SCALE, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawConnHighlight(ctx, graph, slot, selected) {
  const c = graph.connections.get(selected.entity.id);
  if (!c) return;
  const a = graph.points.get(c.from);
  const b = graph.points.get(c.to);
  if (!a || !b) return;
  const o = slotOrigin(slot);
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(SLOT_SCALE, SLOT_SCALE);
  ctx.lineWidth = 4 / SLOT_SCALE;
  ctx.beginPath();
  ctx.moveTo(a.pos.x, a.pos.y);
  switch (c.curve?.type) {
    case "bezier":
      ctx.bezierCurveTo(
        a.pos.x + c.curve.h1.x, a.pos.y + c.curve.h1.y,
        b.pos.x + c.curve.h2.x, b.pos.y + c.curve.h2.y,
        b.pos.x, b.pos.y,
      );
      break;
    case "arc": {
      const ctrl = arcControlPoint(a.pos, b.pos, c.curve);
      ctx.quadraticCurveTo(ctrl.x, ctrl.y, b.pos.x, b.pos.y);
      break;
    }
    case "line":
    default:
      ctx.lineTo(b.pos.x, b.pos.y);
      break;
  }
  ctx.stroke();
  ctx.restore();
}
