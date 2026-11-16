"use client";

import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import type { PlotParams } from "react-plotly.js";

const PlotlyComponent = createPlotlyComponent(Plotly);

export default function PlotInner(props: PlotParams) {
  return <PlotlyComponent {...props} />;
}
