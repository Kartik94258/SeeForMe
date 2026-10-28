"""Unit tests for the lightweight docTR detection box parser."""
import unittest

from src.detection.box_parser import detection_rows_to_boxes


class DetectionRowsToBoxesTests(unittest.TestCase):
    def test_converts_normalized_coordinates_to_pixels(self):
        rows = [
            [0.10, 0.20, 0.50, 0.60, 0.91],
            [0.00, 0.00, 1.00, 1.00, 0.99],
        ]
        boxes = detection_rows_to_boxes(rows, image_width=200, image_height=100)
        self.assertEqual(len(boxes), 2)
        self.assertEqual(boxes[0], [20.0, 20.0, 80.0, 40.0])
        self.assertEqual(boxes[1], [0.0, 0.0, 200.0, 100.0])

    def test_discards_bad_non_finite_or_reversed_rows(self):
        rows = [
            [0.8, 0.2, 0.3, 0.9, 0.5],  # reversed x
            [0.1, 0.8, 0.9, 0.2, 0.5],  # reversed y
            [float("nan"), 0.1, 0.5, 0.5, 0.5],
            [0.1, 0.2, float("inf"), 0.5, 0.5],
            [0.1, 0.2, 0.5],  # incomplete
            None,
        ]
        self.assertEqual(
            detection_rows_to_boxes(rows, image_width=100, image_height=50),
            [],
        )

    def test_clamps_small_coordinate_drift_and_skips_outside_boxes(self):
        rows = [
            [-0.01, -0.02, 0.50, 0.60, 0.8],
            [1.02, 0.2, 1.1, 0.8, 0.8],
        ]
        boxes = detection_rows_to_boxes(rows, image_width=100, image_height=50)
        self.assertEqual(boxes, [[0.0, 0.0, 50.0, 30.0]])

    def test_empty_and_invalid_image_sizes_return_no_boxes(self):
        self.assertEqual(detection_rows_to_boxes([], 100, 100), [])
        self.assertEqual(detection_rows_to_boxes([[0, 0, 1, 1]], 0, 100), [])


if __name__ == "__main__":
    unittest.main()
