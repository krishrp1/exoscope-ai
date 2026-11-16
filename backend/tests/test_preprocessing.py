import numpy as np
import pandas as pd
import pytest

from backend.ml import config
from backend.ml.preprocessing import (PreprocessConfig, PreprocessingError, Standardizer, clean_series,
                                      clip_outliers, detrend, estimate_ephemeris, fold, normalize_view,
                                      prepare_koi_table, process_light_curve, segment_bounds, split_by_target)
from backend.tests.conftest import make_synthetic_curve


def test_clean_series_drops_missing_and_sorts():
    time = np.array([3.0, 1.0, 2.0, np.nan, 4.0, 4.0])
    flux = np.array([30.0, 10.0, np.nan, 5.0, 40.0, 41.0])
    t, f, _, dropped = clean_series(time, flux)
    assert t.tolist() == [1.0, 3.0, 4.0]
    assert f.tolist() == [10.0, 30.0, 40.0]
    assert dropped == 3  # two missing values and one duplicate timestamp


def test_clean_series_without_time_uses_kepler_cadence():
    t, f, _, _ = clean_series(None, np.ones(10))
    assert np.allclose(np.diff(t), 29.4244 / 1440)


def test_clean_series_length_mismatch():
    with pytest.raises(PreprocessingError):
        clean_series(np.arange(5.0), np.arange(4.0))


def test_segment_bounds_split_on_gap_and_quarter():
    time = np.array([0.0, 0.02, 0.04, 5.0, 5.02, 5.04, 5.06])
    assert segment_bounds(time, None, 0.75) == [(0, 3), (3, 7)]
    quarter = np.array([1, 1, 1, 2, 2, 3, 3])
    assert segment_bounds(time, quarter, 0.75) == [(0, 3), (3, 5), (5, 7)]


def test_detrend_removes_trend_and_keeps_transit(synthetic_curve):
    time, flux = synthetic_curve
    flat, keep, _ = detrend(time, flux, None, 3.0 / 24, PreprocessConfig())
    flat, t = flat[keep], time[keep]
    assert abs(np.median(flat) - 1.0) < 1e-3
    phase_time = (t - 1.1 + 1.6) % 3.2 - 1.6
    in_transit = np.abs(phase_time) < 1.0 / 24
    depth = 1 - np.median(flat[in_transit])
    assert 0.003 < depth < 0.005  # injected 0.004 survives detrending
    assert np.std(flat[~in_transit]) < 5e-4  # the 1% sinusoidal trend is gone


def test_clip_outliers_only_removes_upward():
    rng = np.random.default_rng(0)
    flux = 1 + rng.normal(0, 1e-4, 1000)
    flux[10] = 1.01   # flare-like spike
    flux[20] = 0.95   # deep dip must be kept
    keep = clip_outliers(flux, 5.0)
    assert not keep[10] and keep[20]


def test_fold_centres_transit():
    period, t0 = 3.2, 1.1
    assert np.allclose(fold(np.array([t0, t0 + period, t0 + 5 * period]), period, t0), 0.0)
    phases = fold(np.linspace(0, 50, 999), period, t0)
    assert phases.min() >= -0.5 and phases.max() < 0.5


def test_normalize_view():
    v = normalize_view(np.array([1.0, 1.0, 1.0, 0.9, 1.0]))
    assert np.median(v) == 0 and v.min() == -1
    assert np.all(normalize_view(np.ones(8)) == 0)  # flat input does not divide by zero


def test_process_light_curve_shapes_and_centre(synthetic_curve):
    time, flux = synthetic_curve
    cfg = PreprocessConfig()
    pc = process_light_curve(time, flux, 3.2, 1.1, 3.0, cfg=cfg)
    assert pc.views.shape == (cfg.n_bins, 2) and pc.views.dtype == np.float32
    assert np.isfinite(pc.views).all()
    for c in (0, 1):
        assert pc.views[:, c].min() == pytest.approx(-1.0)
        assert abs(np.median(pc.views[:, c])) < 1e-6
        assert abs(int(pc.views[:, c].argmin()) - cfg.n_bins // 2) <= 6
    assert pc.stats["measured_depth_ppm"] == pytest.approx(4000, rel=0.2)
    assert pc.stats["n_transits_observed"] >= 30


def test_process_is_deterministic(synthetic_curve):
    time, flux = synthetic_curve
    a = process_light_curve(time, flux, 3.2, 1.1, 3.0).views
    b = process_light_curve(time, flux, 3.2, 1.1, 3.0).views
    assert np.array_equal(a, b)


def test_process_handles_missing_values(synthetic_curve):
    time, flux = synthetic_curve
    flux = flux.copy()
    flux[::17] = np.nan
    pc = process_light_curve(time, flux, 3.2, 1.1, 3.0)
    assert pc.stats["n_missing_dropped"] == int(np.isnan(flux).sum())
    assert np.isfinite(pc.views).all()


@pytest.mark.parametrize("kwargs", [dict(period=-1.0), dict(period=np.nan), dict(duration_hours=0.0),
                                    dict(t0=np.inf)])
def test_process_rejects_bad_ephemeris(synthetic_curve, kwargs):
    time, flux = synthetic_curve
    args = dict(period=3.2, t0=1.1, duration_hours=3.0) | kwargs
    with pytest.raises(PreprocessingError):
        process_light_curve(time, flux, **args)


def test_process_rejects_too_few_points():
    with pytest.raises(PreprocessingError, match="valid observations"):
        process_light_curve(np.arange(50.0), np.ones(50), 3.2, 1.1, 3.0)


def test_estimate_ephemeris_recovers_period():
    time, flux = make_synthetic_curve(period=4.7, t0=2.0, depth=0.006, n_days=90.0)
    est = estimate_ephemeris(time, flux)
    ratio = est["period"] / 4.7
    assert any(abs(ratio - k) < 0.01 for k in (0.5, 1.0, 2.0))  # true period or a harmonic
    assert est["bls_snr"] > 10


def test_split_by_target_has_no_leakage_and_is_deterministic():
    kepids = np.repeat(np.arange(200), 2)  # two signals per star
    split = split_by_target(kepids)
    by_split = {s: set(kepids[split == s]) for s in ("train", "val", "test")}
    assert not by_split["train"] & by_split["val"]
    assert not by_split["train"] & by_split["test"]
    assert not by_split["val"] & by_split["test"]
    assert len(by_split["test"]) == 30 and len(by_split["val"]) == 30
    assert np.array_equal(split, split_by_target(kepids))


def test_standardizer_uses_only_the_data_it_was_fitted_on():
    rng = np.random.default_rng(0)
    train = rng.normal(2.0, 3.0, (50, 16, 2)).astype(np.float32)
    other = rng.normal(100.0, 1.0, (50, 16, 2)).astype(np.float32)
    s = Standardizer().fit(train)
    assert np.allclose(s.mean, train.mean(axis=(0, 1)), atol=1e-5)
    assert np.allclose(s.transform(train).mean(axis=(0, 1)), 0, atol=1e-4)
    assert s.transform(other).mean() > 10  # not re-centred on unseen data
    restored = Standardizer.from_dict(s.to_dict())
    assert np.allclose(restored.transform(other), s.transform(other))


def test_prepare_koi_table_uses_real_labels_and_excludes_candidates():
    koi = pd.DataFrame({
        "kepid": [1, 1, 2, 3, 4, 4],
        "kepoi_name": ["K1.01", "K1.02", "K2.01", "K3.01", "K4.01", "K4.01"],
        "koi_disposition": ["CONFIRMED", "FALSE POSITIVE", "CANDIDATE", "CONFIRMED", "FALSE POSITIVE", "FALSE POSITIVE"],
        "koi_period": [1.0, 2.0, 3.0, np.nan, 5.0, 5.0],
        "koi_time0bk": [0.1] * 6,
        "koi_duration": [2.0] * 6,
    })
    out, report = prepare_koi_table(koi)
    assert out["kepoi_name"].tolist() == ["K1.01", "K1.02", "K4.01"]
    assert out["label"].tolist() == [1, 0, 0]
    assert config.CLASS_NAMES == ["FALSE POSITIVE", "CONFIRMED"]
    assert report == {"n_rows_in": 6, "n_duplicate_koi_dropped": 1, "n_missing_ephemeris_dropped": 1,
                      "n_unlabeled_candidate_excluded": 1, "n_rows_out": 3}
