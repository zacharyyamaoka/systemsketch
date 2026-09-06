#!/usr/bin/env python3
"""Generate the mutating-line robotics stress board through the real editor.

The board is deliberately a connected program rather than a specimen sheet:
one waste-sorting cycle contains four substantial functions, one of those
contains a nested servo loop, and ordinary values travel beside four mutable
state channels. Boundary connections use the same durable port identity with
an outer or inner face; the product, not this recipe, decides their geometry.
"""

from __future__ import annotations

# BAM

# PYTHON
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = "mutating-line-examples"
RECIPE = ROOT / "sketches" / "review" / f"{SLUG}.recipe.json"
BOARD = ROOT / "sketches" / "review" / f"{SLUG}.systemsketch"

TITLE_FONT_PX = 20.9
PORT_FONT_PX = 10.8
HEADER_AND_FOOTER_PX = 118
ROW_PITCH_PX = 44


def port(
	pid: str,
	name: str,
	ptype: str,
	*,
	mutates: bool = False,
	effect: bool = False,
	edge_t: float | None = None,
) -> dict:
	value: dict = {"id": pid, "name": name, "type": ptype, "visible": True}
	if mutates:
		value["mutates"] = True
	if effect:
		value["effect"] = True
	if edge_t is not None:
		value["edgeT"] = edge_t
	return value


def auto_size(title: str, inputs: list[dict], outputs: list[dict]) -> tuple[int, int]:
	rows = max(len(inputs), len([item for item in outputs if not item.get("effect")]), 1)
	label_width = max(
		(len(item["name"]) + len(item["type"])) * PORT_FONT_PX + 86
		for item in inputs + outputs
	) if inputs or outputs else 0
	width = round(max(350, len(title) * TITLE_FONT_PX + 92, label_width))
	height = round(HEADER_AND_FOOTER_PX + ROW_PITCH_PX * rows)
	return width, height


def block(
	bid: str,
	x: int,
	y: int,
	*,
	title: str,
	inputs: list[dict],
	outputs: list[dict],
	parent: str | None = None,
	view: str = "port",
	w: int | None = None,
	h: int | None = None,
	description: str = "",
) -> dict:
	auto_w, auto_h = auto_size(title, inputs, outputs)
	shape: dict = {
		"id": bid,
		"type": "block",
		"x": x,
		"y": y,
		"props": {
			"title": title,
			"description": description,
			"blockType": "call",
			"view": view,
			"w": w or auto_w,
			"h": h or auto_h,
			"inputs": inputs,
			"outputs": outputs,
		},
	}
	if parent:
		shape["parentId"] = parent
	return shape


def text(tid: str, x: int, y: int, body: str, *, size: str = "m", color: str = "black") -> dict:
	return {
		"id": tid,
		"type": "text",
		"x": x,
		"y": y,
		"text": body,
		"props": {"size": size, "color": color, "font": "sans"},
	}


def connection(
	cid: str,
	*,
	parent: str | None = None,
	temporal: str = "data",
	delay_value: str = "",
	pill_position: float = 0.5,
) -> dict:
	shape: dict = {
		"id": cid,
		"type": "connection",
		"x": 0,
		"y": 0,
		"props": {
			"start": {"x": 0, "y": 0},
			"end": {"x": 100, "y": 0},
			"routing": "elbow",
			"curve": None,
			"pins": [],
			"elbowRoute": None,
			"temporal": temporal,
			"delayValue": delay_value,
			"pillPosition": pill_position,
			"tunnel": False,
			"tunnelLayer": "",
			"routeMode": "automatic",
			"state": "normal",
		},
	}
	if parent:
		shape["parentId"] = parent
	return shape


def add_wire(
	shapes: list[dict],
	bindings: list[dict],
	cid: str,
	from_id: str,
	from_port: str,
	to_id: str,
	to_port: str,
	*,
	parent: str | None = None,
	from_face: str = "outer",
	to_face: str = "outer",
	temporal: str = "data",
	delay_value: str = "",
	pill_position: float = 0.5,
) -> None:
	shapes.append(connection(
		cid,
		parent=parent,
		temporal=temporal,
		delay_value=delay_value,
		pill_position=pill_position,
	))
	bindings.extend([
		{
			"type": "connection",
			"fromId": cid,
			"toId": from_id,
			"props": {"portId": from_port, "terminal": "start", "face": from_face},
		},
		{
			"type": "connection",
			"fromId": cid,
			"toId": to_id,
			"props": {"portId": to_port, "terminal": "end", "face": to_face},
		},
	])


def wire_scope(
	shapes: list[dict],
	bindings: list[dict],
	parent: str,
	edges: list[tuple[str, str, str, str, str, str, str]],
) -> None:
	for cid, source, source_port, target, target_port, source_face, target_face in edges:
		add_wire(
			shapes,
			bindings,
			cid,
			source,
			source_port,
			target,
			target_port,
			parent=parent,
			from_face=source_face,
			to_face=target_face,
			pill_position=0.4 if "effect" in cid else 0.5,
		)


def build_shell(shapes: list[dict]) -> None:
	"""External producers/consumers plus the top-level expanded call."""
	sources = [
		("camera_buffer", 100, 1300, "RealSense frame buffer", "frames", "deque[RGBDFrame]"),
		("world_store", 100, 1700, "World-model store", "world", "WorldModel"),
		("robot_driver", 100, 2100, "UR5e state stream", "robot", "RobotState"),
		("pick_queue", 100, 2500, "Pick queue", "queue", "deque[Pick]"),
		("sort_config", 100, 2900, "Sorter configuration", "config", "SortConfig"),
	]
	for bid, x, y, title, name, ptype in sources:
		shapes.append(block(
			bid, x, y, title=title, inputs=[], outputs=[port("out", name, ptype)], w=560,
		))

	root_inputs = [
		port("in_frames", "frames", "deque[RGBDFrame]", mutates=True),
		port("in_world", "world", "WorldModel", mutates=True),
		port("in_robot", "robot", "RobotState", mutates=True),
		port("in_queue", "queue", "deque[Pick]", mutates=True),
		port("in_config", "config", "SortConfig"),
	]
	root_outputs = [
		port("out_report", "report", "CycleReport"),
		port("effect:in_frames", "frames", "deque[RGBDFrame]", effect=True, edge_t=0.16),
		port("effect:in_world", "world", "WorldModel", effect=True, edge_t=0.38),
		port("effect:in_robot", "robot", "RobotState", effect=True, edge_t=0.62),
		port("effect:in_queue", "queue", "deque[Pick]", effect=True, edge_t=0.84),
	]
	shapes.append(block(
		"sort_cycle", 900, 1000,
		title="sort_cycle() — one robotic waste-sorting cycle",
		inputs=root_inputs,
		outputs=root_outputs,
		view="expanded",
		w=3700,
		h=3450,
		description="Perception → world update → pick planning → force-controlled execution",
	))

	for bid, x, title, name, ptype in [
		("frame_metrics", 1150, "Camera backlog metrics", "frames", "deque[RGBDFrame]"),
		("world_checkpoint", 2100, "Persist world snapshot", "world", "WorldModel"),
		("robot_watchdog", 3100, "Robot-state watchdog", "robot", "RobotState"),
		("queue_metrics", 4050, "Queue-depth metrics", "queue", "deque[Pick]"),
	]:
		shapes.append(block(
			bid, x, 610, title=title, inputs=[port("in", name, ptype)], outputs=[], w=520,
		))
	shapes.append(block(
		"ops_dashboard", 4900, 2900, title="Operations dashboard",
		inputs=[port("in_report", "report", "CycleReport")], outputs=[], w=520,
	))


def build_root_functions(shapes: list[dict]) -> None:
	"""Four substantial call sites that live directly in sort_cycle()."""
	shapes.extend([
		block(
			"acquire_scene", 180, 180, parent="sort_cycle", view="expanded", w=1550, h=1020,
			title="acquire_scene()",
			inputs=[
				port("in_frames", "frames", "deque[RGBDFrame]", mutates=True),
				port("in_config", "config", "SortConfig"),
			],
			outputs=[
				port("out_scene", "scene", "SceneCloud"),
				port("effect:in_frames", "frames", "deque[RGBDFrame]", effect=True, edge_t=0.52),
			],
		),
		block(
			"update_world", 1900, 180, parent="sort_cycle", view="expanded", w=1500, h=1020,
			title="update_world_model()",
			inputs=[
				port("in_scene", "scene", "SceneCloud"),
				port("in_world", "world", "WorldModel", mutates=True),
				port("in_config", "config", "SortConfig"),
			],
			outputs=[
				port("out_tracks", "tracks", "list[TrackedObject]"),
				port("effect:in_world", "world", "WorldModel", effect=True, edge_t=0.56),
			],
		),
		block(
			"plan_pick", 180, 1500, parent="sort_cycle", view="expanded", w=1550, h=1250,
			title="plan_pick()",
			inputs=[
				port("in_tracks", "tracks", "list[TrackedObject]"),
				port("in_robot", "robot", "RobotState"),
				port("in_queue", "queue", "deque[Pick]", mutates=True),
				port("in_config", "config", "SortConfig"),
			],
			outputs=[
				port("out_plan", "plan", "PickPlan"),
				port("effect:in_queue", "queue", "deque[Pick]", effect=True, edge_t=0.48),
			],
		),
		block(
			"execute_pick", 1900, 1350, parent="sort_cycle", view="expanded", w=1500, h=1800,
			title="execute_pick()",
			inputs=[
				port("in_plan", "plan", "PickPlan"),
				port("in_robot", "robot", "RobotState", mutates=True),
				port("in_config", "config", "SortConfig"),
			],
			outputs=[
				port("out_report", "report", "CycleReport"),
				port("effect:in_robot", "robot", "RobotState", effect=True, edge_t=0.54),
			],
		),
	])


def build_acquire_scene(shapes: list[dict]) -> None:
	shapes.extend([
		block(
			"pop_frame", 170, 170, parent="acquire_scene", title="frames.popleft()",
			inputs=[port("in_frames", "frames", "deque[RGBDFrame]", mutates=True)],
			outputs=[
				port("out_rgbd", "rgbd", "RGBDFrame"),
				port("effect:in_frames", "frames", "deque[RGBDFrame]", effect=True, edge_t=0.52),
			],
			w=500,
		),
		block(
			"decode_rgbd", 820, 170, parent="acquire_scene", title="decode_rgbd()",
			inputs=[port("in_rgbd", "rgbd", "RGBDFrame"), port("in_config", "config", "SortConfig")],
			outputs=[port("out_rgb", "rgb", "RGBImage"), port("out_depth", "depth", "DepthImage")],
			w=520,
		),
		block(
			"denoise_depth", 820, 560, parent="acquire_scene", title="denoise_depth()",
			inputs=[port("in_depth", "depth", "DepthImage"), port("in_config", "config", "SortConfig")],
			outputs=[port("out_depth", "depth_clean", "DepthImage")], w=520,
		),
		block(
			"build_scene", 170, 650, parent="acquire_scene", title="project_scene_cloud()",
			inputs=[port("in_rgb", "rgb", "RGBImage"), port("in_depth", "depth", "DepthImage")],
			outputs=[port("out_scene", "scene", "SceneCloud")], w=520,
		),
	])


def build_update_world(shapes: list[dict]) -> None:
	shapes.extend([
		block(
			"segment_objects", 170, 170, parent="update_world", title="segment_waste()",
			inputs=[port("in_scene", "scene", "SceneCloud"), port("in_config", "config", "SortConfig")],
			outputs=[port("out_detections", "detections", "list[Detection]")], w=500,
		),
		block(
			"associate_tracks", 790, 170, parent="update_world", title="associate_tracks()",
			inputs=[
				port("in_detections", "detections", "list[Detection]"),
				port("in_world", "world", "WorldModel", mutates=True),
			],
			outputs=[
				port("out_tracks", "tracks", "list[TrackedObject]"),
				port("effect:in_world", "world", "WorldModel", effect=True, edge_t=0.54),
			],
			w=540,
		),
		block(
			"estimate_velocity", 790, 570, parent="update_world", title="estimate_velocity()",
			inputs=[port("in_tracks", "tracks", "list[TrackedObject]")],
			outputs=[port("out_tracks", "moving_tracks", "list[TrackedObject]")], w=540,
		),
		block(
			"label_material", 170, 650, parent="update_world", title="label_material()",
			inputs=[
				port("in_tracks", "tracks", "list[TrackedObject]"),
				port("in_config", "config", "SortConfig"),
			],
			outputs=[port("out_tracks", "tracks", "list[TrackedObject]")], w=500,
		),
	])


def build_plan_pick(shapes: list[dict]) -> None:
	shapes.extend([
		block(
			"sample_grasps", 170, 170, parent="plan_pick", title="sample_grasps()",
			inputs=[
				port("in_tracks", "tracks", "list[TrackedObject]"),
				port("in_robot", "robot", "RobotState"),
				port("in_config", "config", "SortConfig"),
			],
			outputs=[port("out_candidates", "candidates", "list[Grasp]")], w=520,
		),
		block(
			"collision_filter", 820, 170, parent="plan_pick", title="collision_filter()",
			inputs=[
				port("in_candidates", "candidates", "list[Grasp]"),
				port("in_tracks", "tracks", "list[TrackedObject]"),
				port("in_robot", "robot", "RobotState"),
			],
			outputs=[port("out_feasible", "feasible", "list[Grasp]")], w=540,
		),
		block(
			"rank_pick", 820, 590, parent="plan_pick", title="rank_pick()",
			inputs=[
				port("in_feasible", "feasible", "list[Grasp]"),
				port("in_tracks", "tracks", "list[TrackedObject]"),
			],
			outputs=[port("out_pick", "pick", "Pick")], w=500,
		),
		block(
			"append_pick", 170, 720, parent="plan_pick", title="queue.append()",
			inputs=[
				port("in_queue", "queue", "deque[Pick]", mutates=True),
				port("in_pick", "pick", "Pick"),
			],
			outputs=[port("effect:in_queue", "queue", "deque[Pick]", effect=True, edge_t=0.48)],
			w=500,
		),
		block(
			"compose_plan", 820, 900, parent="plan_pick", title="compose_pick_plan()",
			inputs=[port("in_pick", "pick", "Pick"), port("in_robot", "robot", "RobotState")],
			outputs=[port("out_plan", "plan", "PickPlan")], w=540,
		),
	])


def build_execute_pick(shapes: list[dict]) -> None:
	shapes.extend([
		block(
			"interpolate_plan", 150, 140, parent="execute_pick", title="interpolate_plan()",
			inputs=[port("in_plan", "plan", "PickPlan"), port("in_config", "config", "SortConfig")],
			outputs=[port("out_trajectory", "trajectory", "JointTrajectory")], w=420,
		),
		block(
			"close_gripper", 610, 140, parent="execute_pick", title="close_gripper()",
			inputs=[port("in_plan", "plan", "PickPlan"), port("in_trace", "trace", "ServoTrace")],
			outputs=[port("out_grip", "grip", "GripState")], w=420,
		),
		block(
			"verify_pick", 1060, 140, parent="execute_pick", title="verify_pick()",
			inputs=[
				port("in_grip", "grip", "GripState"),
				port("in_trace", "trace", "ServoTrace"),
				port("in_config", "config", "SortConfig"),
			],
			outputs=[port("out_report", "report", "CycleReport")], w=390,
		),
		block(
			"servo_loop", 150, 500, parent="execute_pick", view="expanded", w=1200, h=1120,
			title="servo_loop() — 1 kHz force control",
			inputs=[
				port("in_trajectory", "trajectory", "JointTrajectory"),
				port("in_robot", "robot", "RobotState", mutates=True),
				port("in_config", "config", "SortConfig"),
			],
			outputs=[
				port("out_trace", "trace", "ServoTrace"),
				port("effect:in_robot", "robot", "RobotState", effect=True, edge_t=0.52),
			],
		),
	])


def build_servo_loop(shapes: list[dict]) -> None:
	shapes.extend([
		block(
			"read_joints", 150, 140, parent="servo_loop", title="read_joint_state()",
			inputs=[port("in_robot", "robot", "RobotState")],
			outputs=[port("out_q", "q", "JointVector"), port("out_dq", "dq", "JointVector")], w=410,
		),
		block(
			"inverse_dynamics", 650, 140, parent="servo_loop", title="inverse_dynamics()",
			inputs=[
				port("in_trajectory", "trajectory", "JointTrajectory"),
				port("in_q", "q", "JointVector"),
				port("in_dq", "dq", "JointVector"),
				port("in_config", "config", "SortConfig"),
			],
			outputs=[port("out_torque", "torque_cmd", "JointVector")], w=450,
		),
		block(
			"apply_torque", 150, 520, parent="servo_loop", title="apply_torque()",
			inputs=[
				port("in_robot", "robot", "RobotState", mutates=True),
				port("in_torque", "safe_torque", "JointVector"),
			],
			outputs=[
				port("out_residual", "residual", "Wrench"),
				port("effect:in_robot", "robot", "RobotState", effect=True, edge_t=0.52),
			],
			w=430,
		),
		block(
			"saturate_torque", 650, 530, parent="servo_loop", title="saturate_torque()",
			inputs=[port("in_torque", "torque_cmd", "JointVector"), port("in_config", "config", "SortConfig")],
			outputs=[port("out_torque", "safe_torque", "JointVector")], w=450,
		),
		block(
			"sample_trace", 650, 760, parent="servo_loop", title="sample_servo_trace()",
			inputs=[
				port("in_q", "q", "JointVector"),
				port("in_dq", "dq", "JointVector"),
				port("in_torque", "safe_torque", "JointVector"),
				port("in_residual", "residual", "Wrench"),
			],
			outputs=[port("out_trace", "trace", "ServoTrace")], w=450,
		),
	])


def build_shapes() -> list[dict]:
	shapes: list[dict] = []
	build_shell(shapes)
	build_root_functions(shapes)
	build_acquire_scene(shapes)
	build_update_world(shapes)
	build_plan_pick(shapes)
	build_execute_pick(shapes)
	build_servo_loop(shapes)
	return shapes


def build_bindings(shapes: list[dict]) -> list[dict]:
	bindings: list[dict] = []

	for cid, source, target in [
		("root_frames", "camera_buffer", "in_frames"),
		("root_world", "world_store", "in_world"),
		("root_robot", "robot_driver", "in_robot"),
		("root_queue", "pick_queue", "in_queue"),
		("root_config", "sort_config", "in_config"),
	]:
		add_wire(shapes, bindings, cid, source, "out", "sort_cycle", target)

	wire_scope(shapes, bindings, "sort_cycle", [
		("cycle_frames", "sort_cycle", "in_frames", "acquire_scene", "in_frames", "inner", "outer"),
		("cycle_config_acquire", "sort_cycle", "in_config", "acquire_scene", "in_config", "inner", "outer"),
		("cycle_scene", "acquire_scene", "out_scene", "update_world", "in_scene", "outer", "outer"),
		("cycle_world", "sort_cycle", "in_world", "update_world", "in_world", "inner", "outer"),
		("cycle_config_world", "sort_cycle", "in_config", "update_world", "in_config", "inner", "outer"),
		("cycle_tracks", "update_world", "out_tracks", "plan_pick", "in_tracks", "outer", "outer"),
		("cycle_robot_plan", "sort_cycle", "in_robot", "plan_pick", "in_robot", "inner", "outer"),
		("cycle_queue", "sort_cycle", "in_queue", "plan_pick", "in_queue", "inner", "outer"),
		("cycle_config_plan", "sort_cycle", "in_config", "plan_pick", "in_config", "inner", "outer"),
		("cycle_plan", "plan_pick", "out_plan", "execute_pick", "in_plan", "outer", "outer"),
		("cycle_robot_execute", "sort_cycle", "in_robot", "execute_pick", "in_robot", "inner", "outer"),
		("cycle_config_execute", "sort_cycle", "in_config", "execute_pick", "in_config", "inner", "outer"),
		("cycle_report", "execute_pick", "out_report", "sort_cycle", "out_report", "outer", "inner"),
		("cycle_frames_effect", "acquire_scene", "effect:in_frames", "sort_cycle", "effect:in_frames", "outer", "inner"),
		("cycle_world_effect", "update_world", "effect:in_world", "sort_cycle", "effect:in_world", "outer", "inner"),
		("cycle_queue_effect", "plan_pick", "effect:in_queue", "sort_cycle", "effect:in_queue", "outer", "inner"),
		("cycle_robot_effect", "execute_pick", "effect:in_robot", "sort_cycle", "effect:in_robot", "outer", "inner"),
	])

	wire_scope(shapes, bindings, "acquire_scene", [
		("acquire_frames", "acquire_scene", "in_frames", "pop_frame", "in_frames", "inner", "outer"),
		("acquire_config_decode", "acquire_scene", "in_config", "decode_rgbd", "in_config", "inner", "outer"),
		("acquire_config_denoise", "acquire_scene", "in_config", "denoise_depth", "in_config", "inner", "outer"),
		("acquire_rgbd", "pop_frame", "out_rgbd", "decode_rgbd", "in_rgbd", "outer", "outer"),
		("acquire_rgb", "decode_rgbd", "out_rgb", "build_scene", "in_rgb", "outer", "outer"),
		("acquire_depth", "decode_rgbd", "out_depth", "denoise_depth", "in_depth", "outer", "outer"),
		("acquire_depth_clean", "denoise_depth", "out_depth", "build_scene", "in_depth", "outer", "outer"),
		("acquire_scene_out", "build_scene", "out_scene", "acquire_scene", "out_scene", "outer", "inner"),
		("acquire_frames_effect", "pop_frame", "effect:in_frames", "acquire_scene", "effect:in_frames", "outer", "inner"),
	])

	wire_scope(shapes, bindings, "update_world", [
		("world_scene", "update_world", "in_scene", "segment_objects", "in_scene", "inner", "outer"),
		("world_config_segment", "update_world", "in_config", "segment_objects", "in_config", "inner", "outer"),
		("world_detections", "segment_objects", "out_detections", "associate_tracks", "in_detections", "outer", "outer"),
		("world_state", "update_world", "in_world", "associate_tracks", "in_world", "inner", "outer"),
		("world_tracks", "associate_tracks", "out_tracks", "estimate_velocity", "in_tracks", "outer", "outer"),
		("world_velocity", "estimate_velocity", "out_tracks", "label_material", "in_tracks", "outer", "outer"),
		("world_config_label", "update_world", "in_config", "label_material", "in_config", "inner", "outer"),
		("world_tracks_out", "label_material", "out_tracks", "update_world", "out_tracks", "outer", "inner"),
		("world_effect", "associate_tracks", "effect:in_world", "update_world", "effect:in_world", "outer", "inner"),
	])

	wire_scope(shapes, bindings, "plan_pick", [
		("plan_tracks_sample", "plan_pick", "in_tracks", "sample_grasps", "in_tracks", "inner", "outer"),
		("plan_robot_sample", "plan_pick", "in_robot", "sample_grasps", "in_robot", "inner", "outer"),
		("plan_config_sample", "plan_pick", "in_config", "sample_grasps", "in_config", "inner", "outer"),
		("plan_candidates", "sample_grasps", "out_candidates", "collision_filter", "in_candidates", "outer", "outer"),
		("plan_tracks_filter", "plan_pick", "in_tracks", "collision_filter", "in_tracks", "inner", "outer"),
		("plan_robot_filter", "plan_pick", "in_robot", "collision_filter", "in_robot", "inner", "outer"),
		("plan_feasible", "collision_filter", "out_feasible", "rank_pick", "in_feasible", "outer", "outer"),
		("plan_tracks_rank", "plan_pick", "in_tracks", "rank_pick", "in_tracks", "inner", "outer"),
		("plan_pick_queue", "plan_pick", "in_queue", "append_pick", "in_queue", "inner", "outer"),
		("plan_rank_queue", "rank_pick", "out_pick", "append_pick", "in_pick", "outer", "outer"),
		("plan_rank_compose", "rank_pick", "out_pick", "compose_plan", "in_pick", "outer", "outer"),
		("plan_robot_compose", "plan_pick", "in_robot", "compose_plan", "in_robot", "inner", "outer"),
		("plan_out", "compose_plan", "out_plan", "plan_pick", "out_plan", "outer", "inner"),
		("plan_queue_effect", "append_pick", "effect:in_queue", "plan_pick", "effect:in_queue", "outer", "inner"),
	])

	wire_scope(shapes, bindings, "execute_pick", [
		("execute_plan_interpolate", "execute_pick", "in_plan", "interpolate_plan", "in_plan", "inner", "outer"),
		("execute_config_interpolate", "execute_pick", "in_config", "interpolate_plan", "in_config", "inner", "outer"),
		("execute_trajectory", "interpolate_plan", "out_trajectory", "servo_loop", "in_trajectory", "outer", "outer"),
		("execute_robot", "execute_pick", "in_robot", "servo_loop", "in_robot", "inner", "outer"),
		("execute_config_servo", "execute_pick", "in_config", "servo_loop", "in_config", "inner", "outer"),
		("execute_plan_gripper", "execute_pick", "in_plan", "close_gripper", "in_plan", "inner", "outer"),
		("execute_trace_gripper", "servo_loop", "out_trace", "close_gripper", "in_trace", "outer", "outer"),
		("execute_grip_verify", "close_gripper", "out_grip", "verify_pick", "in_grip", "outer", "outer"),
		("execute_trace_verify", "servo_loop", "out_trace", "verify_pick", "in_trace", "outer", "outer"),
		("execute_config_verify", "execute_pick", "in_config", "verify_pick", "in_config", "inner", "outer"),
		("execute_report", "verify_pick", "out_report", "execute_pick", "out_report", "outer", "inner"),
		("execute_robot_effect", "servo_loop", "effect:in_robot", "execute_pick", "effect:in_robot", "outer", "inner"),
	])

	wire_scope(shapes, bindings, "servo_loop", [
		("servo_robot_read", "servo_loop", "in_robot", "read_joints", "in_robot", "inner", "outer"),
		("servo_robot_apply", "servo_loop", "in_robot", "apply_torque", "in_robot", "inner", "outer"),
		("servo_trajectory", "servo_loop", "in_trajectory", "inverse_dynamics", "in_trajectory", "inner", "outer"),
		("servo_config_dynamics", "servo_loop", "in_config", "inverse_dynamics", "in_config", "inner", "outer"),
		("servo_q_dynamics", "read_joints", "out_q", "inverse_dynamics", "in_q", "outer", "outer"),
		("servo_dq_dynamics", "read_joints", "out_dq", "inverse_dynamics", "in_dq", "outer", "outer"),
		("servo_torque", "inverse_dynamics", "out_torque", "saturate_torque", "in_torque", "outer", "outer"),
		("servo_config_saturate", "servo_loop", "in_config", "saturate_torque", "in_config", "inner", "outer"),
		("servo_safe_torque_apply", "saturate_torque", "out_torque", "apply_torque", "in_torque", "outer", "outer"),
		("servo_q_trace", "read_joints", "out_q", "sample_trace", "in_q", "outer", "outer"),
		("servo_dq_trace", "read_joints", "out_dq", "sample_trace", "in_dq", "outer", "outer"),
		("servo_torque_trace", "saturate_torque", "out_torque", "sample_trace", "in_torque", "outer", "outer"),
		("servo_residual", "apply_torque", "out_residual", "sample_trace", "in_residual", "outer", "outer"),
		("servo_trace_out", "sample_trace", "out_trace", "servo_loop", "out_trace", "outer", "inner"),
		("servo_robot_effect", "apply_torque", "effect:in_robot", "servo_loop", "effect:in_robot", "outer", "inner"),
	])

	add_wire(shapes, bindings, "report_dashboard", "sort_cycle", "out_report", "ops_dashboard", "in_report")
	for cid, effect_port, target, temporal, delay in [
		("frames_metrics", "effect:in_frames", "frame_metrics", "data", ""),
		("world_checkpoint_wire", "effect:in_world", "world_checkpoint", "data", ""),
		("robot_watchdog_wire", "effect:in_robot", "robot_watchdog", "delayed", "dt"),
		("queue_metrics_wire", "effect:in_queue", "queue_metrics", "data", ""),
	]:
		add_wire(
			shapes,
			bindings,
			cid,
			"sort_cycle",
			effect_port,
			target,
			"in",
			temporal=temporal,
			delay_value=delay,
			pill_position=0.62,
		)

	return bindings


def main() -> None:
	shapes = build_shapes()
	bindings = build_bindings(shapes)
	shapes.extend([
		text("board_title", 100, 120, "Mutation flow under load — robotic waste sorter", size="xl"),
		text(
			"board_subtitle",
			100,
			190,
			"Six Expanded scopes · four Block levels · dense dataflow · four mutable states",
			size="m",
			color="grey",
		),
	])
	callouts = [
		{
			"id": "step_direction",
			"kind": "step",
			"x": 900,
			"y": 300,
			"w": 720,
			"h": 190,
			"text": (
				"1 · Inspect the nine orange boundary segments across four state channels. At an Expanded Block's inner face, "
				"the top-edge port must point DOWN into the function. No cable may loop above its parent header."
			),
			"target": {"shapeId": "sort_cycle", "anchor": "top", "dx": -1050},
		},
		{
			"id": "step_collapse",
			"kind": "step",
			"x": 4800,
			"y": 3520,
			"w": 560,
			"h": 190,
			"text": (
				"2 · Collapse and re-expand execute_pick(). The servo-loop data and mutation cables "
				"must disappear and return without changing their endpoints."
			),
			"target": {"shapeId": "execute_pick", "anchor": "right", "dy": 360},
		},
		{
			"id": "pass",
			"kind": "pass",
			"x": 900,
			"y": 4660,
			"w": 900,
			"h": 230,
			"text": (
				"PASS WHEN\n"
				"Inner-face effect wires approach the same top dot from below.\n"
				"frames, world, queue, and robot mutations each survive two boundaries.\n"
				"Ordinary RGB-D, tracking, grasp, trajectory, torque, and report data remain wired.\n"
				"Collapsing and reopening execute_pick() preserves every connection."
			),
		},
	]

	payload = {
		"feature": "Mutation-flow robotics stress test",
		"viewport": {"width": 2400, "height": 1500},
		"shapes": shapes,
		"bindings": bindings,
		"callouts": callouts,
	}
	RECIPE.parent.mkdir(parents=True, exist_ok=True)
	RECIPE.write_text(json.dumps(payload, indent=2) + "\n")
	print(f"wrote {RECIPE} ({len(shapes)} shapes, {len(bindings)} bindings)")
	result = subprocess.run([
		"node",
		str(ROOT / "skills" / "systemsketch-review-fixture" / "scripts" / "create_fixture.mjs"),
		"--recipe", str(RECIPE),
		"--output", str(BOARD),
		"--force",
	], cwd=ROOT)
	sys.exit(result.returncode)


if __name__ == "__main__":
	main()
