"""1D CNN for transit-signal classification.

Input: (n_bins, 2) -- the standardized global and local phase-folded views.
Output: softmax over the dataset's two resolved dispositions
(FALSE POSITIVE, CONFIRMED). The softmax score is a model output, not the
probability that an object is a real planet.
"""
from __future__ import annotations

import keras
from keras import layers


def build_model(input_shape: tuple[int, int] = (256, 2), n_classes: int = 2, dropout: float = 0.3,
                learning_rate: float = 1e-3) -> keras.Model:
    inputs = keras.Input(shape=input_shape, name="views")
    x = inputs
    for i, (filters, kernel, pool) in enumerate([(32, 5, True), (64, 5, True), (128, 3, False)], start=1):
        x = layers.Conv1D(filters, kernel, padding="same", name=f"conv{i}")(x)
        x = layers.BatchNormalization(name=f"bn{i}")(x)
        x = layers.ReLU(name=f"relu{i}")(x)
        if pool:
            x = layers.MaxPooling1D(2, name=f"pool{i}")(x)
    x = layers.GlobalAveragePooling1D(name="gap")(x)
    x = layers.Dense(64, activation="relu", name="dense")(x)
    x = layers.Dropout(dropout, name="dropout")(x)
    outputs = layers.Dense(n_classes, activation="softmax", name="probabilities")(x)
    model = keras.Model(inputs, outputs, name="exoscope_cnn1d")
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=learning_rate),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    return model


def describe_model(model: keras.Model) -> dict:
    """Layer-by-layer summary for the model config artifact and the UI."""
    return {
        "name": model.name,
        "input_shape": list(model.input_shape[1:]),
        "output_shape": list(model.output_shape[1:]),
        "total_params": int(model.count_params()),
        "layers": [{"name": layer.name, "type": layer.__class__.__name__,
                    "output_shape": list(layer.output.shape[1:]), "params": int(layer.count_params())}
                   for layer in model.layers],
    }
