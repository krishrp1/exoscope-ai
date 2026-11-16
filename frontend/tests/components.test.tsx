import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DispositionBadge, ProvenanceBadge } from "@/components/common/badges";
import { EmptyState, ErrorState } from "@/components/common/states";
import { ProbabilityBars } from "@/components/predict/prediction-result";
import { AnalysisStages } from "@/components/predict/stages";

describe("badges", () => {
  it("labels each data source with its provenance", () => {
    render(<><ProvenanceBadge kind="kaggle" /><ProvenanceBadge kind="mast" /><ProvenanceBadge kind="synthetic" /><ProvenanceBadge kind="user" /></>);
    expect(screen.getByText("Original Kaggle data")).toBeInTheDocument();
    expect(screen.getByText("Additional genuine astronomical observations")).toBeInTheDocument();
    expect(screen.getByText("Synthetic demonstration data")).toBeInTheDocument();
    expect(screen.getByText("User-uploaded data")).toBeInTheDocument();
  });

  it("shows the dataset label as given, and says so when there is none", () => {
    render(<><DispositionBadge value="FALSE POSITIVE" /><DispositionBadge value={null} /></>);
    expect(screen.getByText("FALSE POSITIVE")).toBeInTheDocument();
    expect(screen.getByText("No label")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("error state is an alert with a retry button", () => {
    let retried = false;
    render(<ErrorState message="Backend offline" onRetry={() => { retried = true; }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Backend offline");
    screen.getByRole("button", { name: /try again/i }).click();
    expect(retried).toBe(true);
  });

  it("empty state shows its message", () => {
    render(<EmptyState title="No predictions yet" message="Run one." />);
    expect(screen.getByText("No predictions yet")).toBeInTheDocument();
  });
});

describe("analysis stages", () => {
  const processing = {
    stage_order: ["loading", "validating", "ephemeris_search", "normalizing", "extracting_features", "cnn_inference", "preparing_results"],
    stages_ms: { loading: 0.5, validating: 0.02, ephemeris_search: 581.4, normalizing: 3.4, extracting_features: 2.7, cnn_inference: 3.5, preparing_results: 20.6 },
    total_ms: 612.12,
  };

  it("shows the timings the backend measured, in the backend's order", () => {
    render(<AnalysisStages running={false} processing={processing} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items[2]).toHaveTextContent("Estimating period (BLS)");
    expect(items[2]).toHaveTextContent("581.4 ms");
    expect(items[5]).toHaveTextContent("3.50 ms");
    expect(screen.getByRole("status")).toHaveTextContent("Total 612.1 ms");
  });

  it("shows no timings while the request is running", () => {
    render(<AnalysisStages running processing={null} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByText(/\d ms/)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Running on the backend");
  });
});

describe("probability bars", () => {
  it("prints each class score to four decimals", () => {
    render(<ProbabilityBars probabilities={{ "FALSE POSITIVE": 0.52181566, CONFIRMED: 0.47818434 }} />);
    expect(screen.getByText("0.5218")).toBeInTheDocument();
    expect(screen.getByText("0.4782")).toBeInTheDocument();
  });
});
