import numpy as np
import pytest

from backend.ml.explainability import METHODS, explain, integrated_gradients, occlusion, saliency
from backend.ml.predict import Predictor


@pytest.fixture(scope="module")
def setup(trained):
    predictor = Predictor.load(trained["models_dir"])
    data, _ = trained["dataset"]
    x = predictor.standardizer.transform(data["x"][1:2])[0]  # a synthetic transit sample
    return predictor, x


def test_saliency_shape_and_sign(setup):
    predictor, x = setup
    s = saliency(predictor.model, x, 1)
    assert s.shape == x.shape and (s >= 0).all() and s.max() > 0


def test_integrated_gradients_completeness(setup):
    predictor, x = setup
    base = predictor.baseline()
    ig = integrated_gradients(predictor.model, x, base, 1, steps=128)
    f_x = float(np.asarray(predictor.model(x[None]))[0, 1])
    f_base = float(np.asarray(predictor.model(base[None]))[0, 1])
    assert ig.shape == x.shape
    assert ig.sum() == pytest.approx(f_x - f_base, abs=0.02)


def test_occlusion_of_baseline_changes_nothing(setup):
    predictor, _ = setup
    base = predictor.baseline()
    assert np.allclose(occlusion(predictor.model, base, base, 1), 0.0, atol=1e-6)


def test_occlusion_shape(setup):
    predictor, x = setup
    assert occlusion(predictor.model, x, predictor.baseline(), 1).shape == x.shape


def test_explain_dispatch_and_unknown_method(setup):
    predictor, x = setup
    out = explain(predictor.model, x, predictor.baseline(), 1)
    assert set(out) == set(METHODS)
    with pytest.raises(ValueError):
        explain(predictor.model, x, predictor.baseline(), 1, ["grad_cam"])
