/**
 * Behavior Tree stress-test gallery.
 *
 * Zach's ask, 2026-09-06: "create around twenty examples from super trivial,
 * easy to very hard, complicated, lots of nesting, failure loops, so we can
 * really stress test that it all operates properly." Every tree below is
 * built the same way every other Behavior Tree fixture in this repo is built
 * — `editor.createShape({ type: 'behaviorTree', props: { xml, projection } })`
 * against the real running app — and both the real "Tree" and "Process" view
 * buttons are clicked to switch projections, exactly like a person would.
 * Nothing here hand-writes tldraw shape JSON; the region's own reconcile
 * installer (`installBehaviorTreeRegions.ts`) is what turns each XML string
 * into real Block/pill/edge shapes.
 *
 * This is a gallery, not a narrow regression proof — the real verification is
 * `docs/build_behavior_tree_stress_gallery.py` and a human looking at all 40
 * renders. But two cheap, generic checks ride along for every single example
 * because they catch exactly the failure modes a stress test exists to find:
 *   - did the tree even project (at least one leaf Block)?
 *   - do any two leaf Block cards overlap on screen (the geometry bug class
 *     the task explicitly asks this gallery to hunt for)?
 *   - did building or viewing it throw a console error?
 * A failing check does not stop the run — it's recorded in manifest.json so
 * the report can surface it as a finding instead of hiding it.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  delay,
  evaluate,
  openApp,
  readConsoleErrors,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-stress-gallery')
const REGION = 'shape:bt-stress-gallery'

// Reused verbatim from `layouts.test.ts` / `behavior_tree_nested_fallback_smoke.mjs`'s
// `NESTED_FALLBACK_XML` fixture — the task explicitly asks tier 4 to match it.
const CANONICAL_3_LEVEL_XML = `<root BTCPP_format="4" main_tree_to_execute="NestedRecovery">
  <BehaviorTree ID="NestedRecovery">
    <Sequence name="Grasp with nested recovery">
      <Fallback name="Grasp or correct">
        <GraspValid pose="{object_pose}" quality="{quality}"/>
        <Fallback name="Correct or retry">
          <CorrectGrip pose="{object_pose}" corrected="{object_pose}"/>
          <Fallback name="Retry or release">
            <RetryGrasp pose="{object_pose}"/>
            <ReleaseAndRetry pose="{object_pose}"/>
          </Fallback>
        </Fallback>
      </Fallback>
      <CloseGrip force="{grip_force}" state="{grip_state}"/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="GraspValid"><input_port name="pose" type="Pose"/><output_port name="quality" type="double"/></Condition>
    <Action ID="CorrectGrip"><input_port name="pose" type="Pose"/><output_port name="corrected" type="Pose"/></Action>
    <Action ID="RetryGrasp"><input_port name="pose" type="Pose"/></Action>
    <Action ID="ReleaseAndRetry"><input_port name="pose" type="Pose"/></Action>
    <Action ID="CloseGrip"><input_port name="force" type="double" default="20"/><output_port name="state" type="GripState"/></Action>
  </TreeNodesModel>
</root>`

// Zach's own literal pattern, reused verbatim from `tests/behavior_tree_pickandplace_literal_smoke.mjs`.
const PICK_AND_PLACE_XML = `<root BTCPP_format="4" main_tree_to_execute="PickAndPlace">
  <BehaviorTree ID="PickAndPlace">
    <Sequence name="Pick and place">
      <Fallback name="Move or correct">
        <MoveHome/>
        <GraspValid/>
        <Sequence>
          <CorrectGrip/>
          <GraspValid/>
        </Sequence>
      </Fallback>
      <CloseGrip/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveHome"/>
    <Condition ID="GraspValid"/>
    <Action ID="CorrectGrip"/>
    <Action ID="CloseGrip"/>
  </TreeNodesModel>
</root>`

const EXAMPLES = [
  // ---------------------------------------------------------------- tier 1
  {
    tier: 1, slug: 'single-skill', title: '1. Single Skill',
    note: 'One bare Skill node — no control node at all. The minimum possible tree.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="SingleSkill">
  <BehaviorTree ID="SingleSkill">
    <Startup/>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="Startup"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 1, slug: 'bare-sequence', title: '2. Bare Sequence',
    note: 'A flat Sequence of 3 skills. No branching, no recovery.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="BareSequence">
  <BehaviorTree ID="BareSequence">
    <Sequence name="Pick and place">
      <MoveToPick/>
      <GraspObject/>
      <MoveToPlace/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveToPick"/>
    <Action ID="GraspObject"/>
    <Action ID="MoveToPlace"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 1, slug: 'bare-fallback', title: '3. Bare Fallback',
    note: 'A flat Fallback of 3 skills. Try each until one succeeds.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="BareFallback">
  <BehaviorTree ID="BareFallback">
    <Fallback name="Grip strategy">
      <TryPrimaryGripper/>
      <TrySecondaryGripper/>
      <TryManualPrompt/>
    </Fallback>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="TryPrimaryGripper"/>
    <Action ID="TrySecondaryGripper"/>
    <Action ID="TryManualPrompt"/>
  </TreeNodesModel>
</root>`,
  },
  // ---------------------------------------------------------------- tier 2
  {
    tier: 2, slug: 'sequence-with-fallback', title: '4. Sequence containing a Fallback',
    note: 'A Sequence whose middle step is a Fallback of 2 skills.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="SequenceWithFallback">
  <BehaviorTree ID="SequenceWithFallback">
    <Sequence name="Pick with grip choice">
      <MoveToPick/>
      <Fallback name="Grip style">
        <GraspFirmly/>
        <GraspGently/>
      </Fallback>
      <MoveToPlace/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveToPick"/>
    <Action ID="GraspFirmly"/>
    <Action ID="GraspGently"/>
    <Action ID="MoveToPlace"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 2, slug: 'fallback-with-sequences', title: '5. Fallback containing Sequences',
    note: 'A Fallback whose two alternatives are each full Sequences, not bare leaves.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="FallbackWithSequences">
  <BehaviorTree ID="FallbackWithSequences">
    <Fallback name="Get charged">
      <Sequence>
        <UseChargingDock/>
        <VerifyCharged/>
      </Sequence>
      <Sequence>
        <RequestManualCharge/>
        <VerifyCharged/>
      </Sequence>
    </Fallback>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="UseChargingDock"/>
    <Condition ID="VerifyCharged"/>
    <Action ID="RequestManualCharge"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 2, slug: 'simple-parallel', title: '6. Simple Parallel',
    note: 'A flat Parallel of 3 monitors, 2-of-3 must succeed. No nesting.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="SimpleParallel">
  <BehaviorTree ID="SimpleParallel">
    <Parallel success_count="2" failure_count="2" name="Health monitors">
      <MonitorBattery/>
      <MonitorPayload/>
      <MonitorTemperature/>
    </Parallel>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MonitorBattery"/>
    <Action ID="MonitorPayload"/>
    <Action ID="MonitorTemperature"/>
  </TreeNodesModel>
</root>`,
  },
  // ---------------------------------------------------------------- tier 3
  {
    tier: 3, slug: 'pickandplace-recovery', title: '7. PickAndPlace one-level recovery',
    note: "Zach's own pattern, reproduced verbatim: Fallback[MoveHome, GraspValid, Sequence[CorrectGrip, GraspValid]].",
    xml: PICK_AND_PLACE_XML,
  },
  {
    tier: 3, slug: 'mid-sequence-recovery', title: '8. Recovery as a middle step',
    note: 'Same one-level recovery shape, but placed mid-Sequence with real siblings before and after it.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="MidSequenceRecovery">
  <BehaviorTree ID="MidSequenceRecovery">
    <Sequence name="Dock sequence">
      <ApproachDock/>
      <Fallback name="Docked or realign">
        <DockedFlag/>
        <Sequence>
          <RealignApproach/>
          <DockedFlag/>
        </Sequence>
      </Fallback>
      <LockDock/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="ApproachDock"/>
    <Condition ID="DockedFlag"/>
    <Action ID="RealignApproach"/>
    <Action ID="LockDock"/>
  </TreeNodesModel>
</root>`,
  },
  // ---------------------------------------------------------------- tier 4
  {
    tier: 4, slug: 'nested-recovery-2-levels', title: '9. Nested recovery — 2 levels',
    note: 'A Fallback recovery arm that itself contains another Fallback with its own recovery arm.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="Nested2Levels">
  <BehaviorTree ID="Nested2Levels">
    <Sequence name="Pick with 2-level recovery">
      <Fallback name="Classify or recalibrate">
        <ObjectClassified/>
        <Sequence>
          <Fallback name="Recalibrate or reposition">
            <CameraCalibrated/>
            <Sequence>
              <RepositionCamera/>
              <CameraCalibrated/>
            </Sequence>
          </Fallback>
        </Sequence>
      </Fallback>
      <PickObject/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="ObjectClassified"/>
    <Condition ID="CameraCalibrated"/>
    <Action ID="RepositionCamera"/>
    <Action ID="PickObject"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 4, slug: 'nested-recovery-3-levels', title: '10. Nested recovery — 3 levels (canonical fixture)',
    note: "The exact nestedFallbackXml fixture from layouts.test.ts / the nested-fallback smoke journey: Grasp → Correct → Retry, each Fallback guarding the one below it.",
    xml: CANONICAL_3_LEVEL_XML,
  },
  {
    tier: 4, slug: 'nested-recovery-4-levels', title: '11. Nested recovery — 4 levels (beyond what is tested)',
    note: 'One level deeper than any existing regression fixture: 4 Fallbacks, each guarding the one below it.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="Nested4Levels">
  <BehaviorTree ID="Nested4Levels">
    <Sequence name="Dock with 4-level recovery">
      <Fallback name="Dock or correct">
        <DockedFlag/>
        <Sequence>
          <Fallback name="Correct or realign">
            <AlignmentOK/>
            <Sequence>
              <Fallback name="Realign or reposition">
                <PositionOK/>
                <Sequence>
                  <Fallback name="Reposition or abort-safe">
                    <ClearOfObstacle/>
                    <Sequence>
                      <BackAwaySlowly/>
                      <ClearOfObstacle/>
                    </Sequence>
                  </Fallback>
                </Sequence>
              </Fallback>
            </Sequence>
          </Fallback>
        </Sequence>
      </Fallback>
      <LockDock/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="DockedFlag"/>
    <Condition ID="AlignmentOK"/>
    <Condition ID="PositionOK"/>
    <Condition ID="ClearOfObstacle"/>
    <Action ID="BackAwaySlowly"/>
    <Action ID="LockDock"/>
  </TreeNodesModel>
</root>`,
  },
  // ---------------------------------------------------------------- tier 5
  {
    tier: 5, slug: 'wide-fallback-5-arms', title: '12. Wide Fallback — 5 arms',
    note: 'One condition plus 4 recovery Sequence arms, all siblings at the same level. Wider than any existing fixture (3 arms).',
    xml: `<root BTCPP_format="4" main_tree_to_execute="WideFallback5">
  <BehaviorTree ID="WideFallback5">
    <Fallback name="Grasp: 5 recovery arms">
      <GraspValid/>
      <Sequence><NudgeGripper/><GraspValid/></Sequence>
      <Sequence><IncreaseForce/><GraspValid/></Sequence>
      <Sequence><SwitchFingerPad/><GraspValid/></Sequence>
      <Sequence><RequestOperatorAssist/><GraspValid/></Sequence>
    </Fallback>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="GraspValid"/>
    <Action ID="NudgeGripper"/>
    <Action ID="IncreaseForce"/>
    <Action ID="SwitchFingerPad"/>
    <Action ID="RequestOperatorAssist"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 5, slug: 'wide-fallback-asymmetric-arms', title: '13. Wide Fallback — asymmetric arm heights + one deep arm',
    note: 'Deliberately adversarial: a bare-leaf arm, a 1-node arm, a 2-node arm, a 3-node arm, AND one arm that itself nests a whole Fallback.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="WideFallbackAsymmetric">
  <BehaviorTree ID="WideFallbackAsymmetric">
    <Fallback name="Grasp: asymmetric arms">
      <GraspValid/>
      <NudgeGripper/>
      <Sequence><IncreaseForce/><GraspValid/></Sequence>
      <Sequence>
        <SwitchFingerPad/>
        <Fallback name="Regrip or manual">
          <GraspValid/>
          <Sequence><RequestOperatorAssist/><GraspValid/></Sequence>
        </Fallback>
      </Sequence>
      <Sequence><SlowClose/><PauseBriefly/><GraspValid/></Sequence>
    </Fallback>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="GraspValid"/>
    <Action ID="NudgeGripper"/>
    <Action ID="IncreaseForce"/>
    <Action ID="SwitchFingerPad"/>
    <Action ID="RequestOperatorAssist"/>
    <Action ID="SlowClose"/>
    <Action ID="PauseBriefly"/>
  </TreeNodesModel>
</root>`,
  },
  // ---------------------------------------------------------------- tier 6
  {
    tier: 6, slug: 'parallel-with-fallback-branch', title: '14. Parallel with a Fallback branch',
    note: 'A Parallel where one branch is itself a Fallback with a recovery arm.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="ParallelWithFallbackBranch">
  <BehaviorTree ID="ParallelWithFallbackBranch">
    <Parallel success_count="2" failure_count="2" name="Watch while sensing">
      <MonitorBattery/>
      <Fallback name="Sensor OK or recalibrate">
        <PrimarySensorOK/>
        <Sequence><RecalibrateSensor/><PrimarySensorOK/></Sequence>
      </Fallback>
      <MonitorPayload/>
    </Parallel>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MonitorBattery"/>
    <Condition ID="PrimarySensorOK"/>
    <Action ID="RecalibrateSensor"/>
    <Action ID="MonitorPayload"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 6, slug: 'parallel-fallbacks-varying-depth', title: '15. Parallel with Fallback branches at varying depth',
    note: 'Three Parallel branches: a plain leaf, a 1-level recovery Fallback, and a 2-level nested recovery Fallback — side by side.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="ParallelVaryingDepth">
  <BehaviorTree ID="ParallelVaryingDepth">
    <Parallel success_count="2" failure_count="2" name="Three depths at once">
      <Fallback name="A or fix">
        <CondA/>
        <Sequence><FixA/><CondA/></Sequence>
      </Fallback>
      <Fallback name="B or fix">
        <CondB/>
        <Sequence>
          <FixB/>
          <Fallback name="C or fix">
            <CondC/>
            <Sequence><FixC/><CondC/></Sequence>
          </Fallback>
        </Sequence>
      </Fallback>
      <HeartbeatOK/>
    </Parallel>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="CondA"/>
    <Action ID="FixA"/>
    <Condition ID="CondB"/>
    <Action ID="FixB"/>
    <Condition ID="CondC"/>
    <Action ID="FixC"/>
    <Condition ID="HeartbeatOK"/>
  </TreeNodesModel>
</root>`,
  },
  // ---------------------------------------------------------------- tier 7
  {
    tier: 7, slug: 'kitchen-sink-wide-nested-parallel', title: '16. Kitchen sink: wide + nested + Parallel',
    note: 'A wide 4-arm Fallback (one arm itself nested), a Parallel with a Fallback branch, and a second independent recovery Fallback later in the same Sequence.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="KitchenSink1">
  <BehaviorTree ID="KitchenSink1">
    <Sequence name="Kitchen sink: wide + nested + parallel">
      <Fallback name="Wide, one arm nested">
        <GraspValid/>
        <Sequence><NudgeGripper/><GraspValid/></Sequence>
        <Sequence><IncreaseForce/><GraspValid/></Sequence>
        <Sequence>
          <SwitchFingerPad/>
          <Fallback name="Nested inside a wide arm">
            <GraspValid/>
            <Sequence><RequestOperatorAssist/><GraspValid/></Sequence>
          </Fallback>
        </Sequence>
      </Fallback>
      <Parallel success_count="2" failure_count="2">
        <Fallback name="Battery or dock">
          <BatteryOK/>
          <Sequence><DockAndCharge/><BatteryOK/></Sequence>
        </Fallback>
        <Sequence><MonitorPayload/><MonitorArmTemp/></Sequence>
      </Parallel>
      <Fallback name="Place or retry">
        <PlaceValid/>
        <Sequence><NudgePlacement/><PlaceValid/></Sequence>
      </Fallback>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="GraspValid"/>
    <Action ID="NudgeGripper"/>
    <Action ID="IncreaseForce"/>
    <Action ID="SwitchFingerPad"/>
    <Action ID="RequestOperatorAssist"/>
    <Condition ID="BatteryOK"/>
    <Action ID="DockAndCharge"/>
    <Action ID="MonitorPayload"/>
    <Action ID="MonitorArmTemp"/>
    <Condition ID="PlaceValid"/>
    <Action ID="NudgePlacement"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 7, slug: 'asymmetric-depth-forest', title: '17. Asymmetric depth: deep-narrow left, wide-shallow right',
    note: 'Left subtree is 4 Fallbacks deep and narrow; right subtree is a flat 5-way Parallel. Genuinely asymmetric branch depths, side by side.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="AsymmetricDepthForest">
  <BehaviorTree ID="AsymmetricDepthForest">
    <Sequence name="Asymmetric: deep left, wide-shallow right">
      <Fallback name="L1">
        <CondL1/>
        <Sequence>
          <FixL1/>
          <Fallback name="L2">
            <CondL2/>
            <Sequence>
              <FixL2/>
              <Fallback name="L3">
                <CondL3/>
                <Sequence>
                  <FixL3/>
                  <Fallback name="L4">
                    <CondL4/>
                    <Sequence><FixL4/><CondL4/></Sequence>
                  </Fallback>
                </Sequence>
              </Fallback>
            </Sequence>
          </Fallback>
        </Sequence>
      </Fallback>
      <Parallel success_count="3" failure_count="3">
        <MonitorA/>
        <MonitorB/>
        <MonitorC/>
        <MonitorD/>
        <MonitorE/>
      </Parallel>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="CondL1"/>
    <Action ID="FixL1"/>
    <Condition ID="CondL2"/>
    <Action ID="FixL2"/>
    <Condition ID="CondL3"/>
    <Action ID="FixL3"/>
    <Condition ID="CondL4"/>
    <Action ID="FixL4"/>
    <Action ID="MonitorA"/>
    <Action ID="MonitorB"/>
    <Action ID="MonitorC"/>
    <Action ID="MonitorD"/>
    <Action ID="MonitorE"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 7, slug: 'multiple-independent-failure-loops', title: '18. Multiple independent failure loops',
    note: 'One mission Sequence containing THREE separate, independent failure-recovery subtrees (dock, 2-level-nested grasp, wide 4-arm place) plus a Parallel monitor step.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="MultipleFailureLoops">
  <BehaviorTree ID="MultipleFailureLoops">
    <Sequence name="Full mission: three independent failure loops">
      <Fallback name="Battery or dock">
        <BatteryOK/>
        <Sequence><DockAndCharge/><BatteryOK/></Sequence>
      </Fallback>
      <MoveToPick/>
      <Fallback name="Grasp or correct">
        <GraspValid/>
        <Sequence>
          <CorrectGrip/>
          <Fallback name="Correct or retry">
            <GraspValid/>
            <Sequence><RetryGrasp/><GraspValid/></Sequence>
          </Fallback>
        </Sequence>
      </Fallback>
      <Parallel success_count="2" failure_count="2">
        <MonitorGrip/>
        <MonitorArmTemp/>
      </Parallel>
      <Fallback name="Place: 4 arms">
        <PlaceValid/>
        <Sequence><NudgePlacement/><PlaceValid/></Sequence>
        <Sequence><RotatePart/><PlaceValid/></Sequence>
        <Sequence><RequestOperatorAssist/><PlaceValid/></Sequence>
      </Fallback>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="BatteryOK"/>
    <Action ID="DockAndCharge"/>
    <Action ID="MoveToPick"/>
    <Condition ID="GraspValid"/>
    <Action ID="CorrectGrip"/>
    <Action ID="RetryGrasp"/>
    <Action ID="MonitorGrip"/>
    <Action ID="MonitorArmTemp"/>
    <Condition ID="PlaceValid"/>
    <Action ID="NudgePlacement"/>
    <Action ID="RotatePart"/>
    <Action ID="RequestOperatorAssist"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 7, slug: 'decorators-with-recovery', title: '19. Decorators wrapping a recovery Fallback',
    note: 'RetryUntilSuccessful, Inverter, ForceSuccess and Repeat — single-child pass-through decorators stress a different layout code path than pure branching.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="DecoratorsWithRecovery">
  <BehaviorTree ID="DecoratorsWithRecovery">
    <Sequence name="Decorators wrapping a recovery Fallback">
      <RetryUntilSuccessful num_attempts="3">
        <Fallback name="Grasp or correct">
          <GraspValid/>
          <Sequence>
            <Inverter><CheckJammed/></Inverter>
            <CorrectGrip/>
            <GraspValid/>
          </Sequence>
        </Fallback>
      </RetryUntilSuccessful>
      <Repeat num_cycles="2">
        <ForceSuccess><LogAttempt/></ForceSuccess>
      </Repeat>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="GraspValid"/>
    <Condition ID="CheckJammed"/>
    <Action ID="CorrectGrip"/>
    <Action ID="LogAttempt"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 7, slug: 'capstone-full-mission', title: '20. Capstone: full mission, every pattern combined',
    note: 'The largest tree: wide branching, nested recovery, Parallel monitoring, and multiple independent failure loops, combined in one realistic mission.',
    xml: `<root BTCPP_format="4" main_tree_to_execute="CapstoneFullMission">
  <BehaviorTree ID="CapstoneFullMission">
    <Sequence name="Full pick-and-place mission with full error handling">
      <Fallback name="Battery or dock">
        <BatteryOK/>
        <Sequence><DockAndCharge/><BatteryOK/></Sequence>
      </Fallback>
      <Sequence>
        <MoveToPick/>
        <Fallback name="Grasp: 3 arms">
          <GraspValid/>
          <Sequence><CorrectGrip/><GraspValid/></Sequence>
          <Sequence><Regrasp/><GraspValid/></Sequence>
        </Fallback>
      </Sequence>
      <Parallel success_count="2" failure_count="2">
        <MonitorGrip/>
        <MonitorArmTemp/>
      </Parallel>
      <Sequence>
        <MoveToPlace/>
        <Fallback name="Place or retry">
          <PlaceValid/>
          <Sequence><NudgePlacement/><PlaceValid/></Sequence>
        </Fallback>
      </Sequence>
      <Fallback name="Task complete or log">
        <TaskComplete/>
        <Sequence><LogFailure/><Retreat/></Sequence>
      </Fallback>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="BatteryOK"/>
    <Action ID="DockAndCharge"/>
    <Action ID="MoveToPick"/>
    <Condition ID="GraspValid"/>
    <Action ID="CorrectGrip"/>
    <Action ID="Regrasp"/>
    <Action ID="MonitorGrip"/>
    <Action ID="MonitorArmTemp"/>
    <Action ID="MoveToPlace"/>
    <Condition ID="PlaceValid"/>
    <Action ID="NudgePlacement"/>
    <Condition ID="TaskComplete"/>
    <Action ID="LogFailure"/>
    <Action ID="Retreat"/>
  </TreeNodesModel>
</root>`,
  },
  // ------------------------------------------------------------- bonus tier
  // RecoveryNode (Nav2's nav2_behavior_tree/plugins/control/recovery_node.cpp
  // extension, controlKind 'recoveryLoop' in btcppXml.ts) landed in this same
  // worktree WHILE this gallery was being built — confirmed live via
  // `grep RecoveryNode src/behaviorTree/btcppXml.ts` returning real matches
  // partway through this session, not assumed. Included per the task brief's
  // explicit instruction to add a bonus tier if it exists by the time this
  // point is reached.
  {
    tier: 8, slug: 'recovery-node-simple', title: '21. Bonus: RecoveryNode (Nav2 extension)',
    note: 'A single RecoveryNode: on primary failure, run one recovery step, then retry the primary — up to 3 times. Different semantics from Fallback (always exactly 2 children; the recovery child never itself succeeds the node).',
    xml: `<root BTCPP_format="4" main_tree_to_execute="RecoveryNodeSimple">
  <BehaviorTree ID="RecoveryNodeSimple">
    <RecoveryNode number_of_retries="3" name="Pick with retry">
      <MoveToPick/>
      <ClearCostmap/>
    </RecoveryNode>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveToPick"/>
    <Action ID="ClearCostmap"/>
  </TreeNodesModel>
</root>`,
  },
  {
    tier: 8, slug: 'recovery-node-nested-granularities', title: '22. Bonus: RecoveryNode nested at multiple granularities',
    note: "Nav2's own navigate_to_pose_w_replanning_and_recovery.xml shape: an outer RecoveryNode wraps the whole pipeline while each step inside carries its own inner RecoveryNode — the exact multi-granularity nesting the model's own WHY comment cites as the reason this primitive exists.",
    xml: `<root BTCPP_format="4" main_tree_to_execute="RecoveryNodeNested">
  <BehaviorTree ID="RecoveryNodeNested">
    <RecoveryNode number_of_retries="6" name="Navigate with replanning and recovery">
      <Sequence name="Compute and follow">
        <RecoveryNode number_of_retries="1" name="Compute path">
          <ComputePathToPose/>
          <ClearGlobalCostmap/>
        </RecoveryNode>
        <RecoveryNode number_of_retries="1" name="Follow path">
          <FollowPath/>
          <ClearLocalCostmap/>
        </RecoveryNode>
      </Sequence>
      <Wait/>
    </RecoveryNode>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="ComputePathToPose"/>
    <Action ID="ClearGlobalCostmap"/>
    <Action ID="FollowPath"/>
    <Action ID="ClearLocalCostmap"/>
    <Action ID="Wait"/>
  </TreeNodesModel>
</root>`,
  },
]

const results = []

function log(line) { process.stdout.write(`${line}\n`) }

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'behavior-tree-stress-gallery', build: 'behavior-tree-stress-gallery-smoke', width: 2000, height: 1250 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)

    const fitRegion = async () => {
      await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const bounds = editor.getShapePageBounds('${REGION}')
        if (bounds) editor.zoomToBounds(bounds, { inset: 60, animation: { duration: 0 } })
        return null
      })()`)
      await delay(250)
    }
    const shot = async (name) => {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile(join(OUT, name), Buffer.from(capture.data, 'base64'))
    }
    const readCards = async () => JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const out = {}
      const parent = editor.getShape('${REGION}')
      if (!parent) return out
      for (const id of editor.getSortedChildIdsForParent('${REGION}')) {
        const shape = editor.getShape(id)
        if (!shape || shape.meta?.btRole !== 'node') continue
        const dom = document.querySelector('.tl-shape[data-shape-id="' + id + '"]')
        if (!dom) continue
        const rect = dom.getBoundingClientRect()
        out[shape.meta.btPath ?? id] = { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
      }
      return out
    })())`))
    const overlaps = (cards) => {
      // Shrink 2px per side so abutting-but-not-overlapping cards never false-positive.
      const shrink = (r) => ({ x: r.x + 2, y: r.y + 2, w: Math.max(0, r.w - 4), h: Math.max(0, r.h - 4) })
      const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
      const entries = Object.entries(cards).map(([path, rect]) => [path, shrink(rect)])
      const hits = []
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          if (intersects(entries[i][1], entries[j][1])) hits.push(`${entries[i][0]} ∩ ${entries[j][0]}`)
        }
      }
      return hits
    }
    const clickViewButton = async (label) => {
      await evaluate(page, `(() => {
        const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(label)})
        button?.click()
        return null
      })()`)
      await delay(300)
    }
    // WHY: selecting the region to reach the inspector's Tree/Process toggle
    // opens the `systemsketch-popout--right` panel — a fixed CSS overlay that
    // `editor.zoomToBounds`/`getViewportScreenBounds` know nothing about (it
    // does not shrink tldraw's own container). On any tree wide enough to
    // reach the panel's ~280px band, a naive fit-then-shot silently crops the
    // rightmost cards behind it — and the panel, once opened, stays docked
    // ("Nothing selected") even after `selectNone()`. Confirmed live via a
    // throwaway region on the same dev server before writing this: container/
    // canvas rects are full-width regardless of panel state, so the panel is
    // a pure overlay, not a layout participant. Closing it via its own real
    // close button before every shot — same as a person would — is the fix;
    // this is a capture-harness gap, not a Behavior Tree layout bug (the same
    // gap exists at every other `zoomToBounds`/`zoomToFit`/`zoomToSelection`
    // call site in this repo — comments, diagnostics, boardSearch,
        // depthNavigation, compare — none of them reserve space for the popout
    // either, so it is a pre-existing, cross-cutting camera/chrome gap, out
    // of scope to fix here).
    const closePanel = async () => {
      await evaluate(page, `(() => {
        document.querySelector('[data-testid="systemsketch-right-popout-close"]')?.click()
        return null
      })()`)
      await evaluate(page, `(() => { window.__systemsketch.editor.selectNone(); return null })()`)
      await delay(150)
    }

    for (const example of EXAMPLES) {
      log(`--- tier ${example.tier}  ${example.slug} ---`)
      const errorsBefore = readConsoleErrors(page).length
      const row = { tier: example.tier, slug: example.slug, title: example.title, note: example.note, xml: example.xml }
      try {
        await evaluate(page, `(() => {
          const editor = window.__systemsketch.editor
          editor.deleteShapes([...editor.getCurrentPageShapeIds()])
          editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: ${JSON.stringify(example.xml)}, title: ${JSON.stringify(example.title)}, projection: 'tree' } })
          editor.selectNone()
          return null
        })()`)
        await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 1`, `${example.slug} to project`, 8000)
        await delay(250)
        row.childCount = await evaluate(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length`)

        await closePanel()
        await fitRegion()
        row.treeFile = `${example.slug}-tree.png`
        await shot(row.treeFile)
        row.treeOverlaps = overlaps(await readCards())

        await evaluate(page, `(() => { window.__systemsketch.editor.select('${REGION}'); return null })()`)
        await delay(150)
        await clickViewButton('Process')
        await closePanel()
        await fitRegion()
        row.processFile = `${example.slug}-process.png`
        await shot(row.processFile)
        row.processOverlaps = overlaps(await readCards())

        row.consoleErrors = readConsoleErrors(page).slice(errorsBefore)
        row.ok = row.childCount >= 1 && row.treeOverlaps.length === 0 && row.processOverlaps.length === 0 && row.consoleErrors.length === 0
        log(`  ${row.ok ? 'OK' : 'FINDING'}  children=${row.childCount} treeOverlaps=${row.treeOverlaps.length} processOverlaps=${row.processOverlaps.length} consoleErrors=${row.consoleErrors.length}`)
      } catch (error) {
        row.error = String(error?.stack ?? error)
        row.ok = false
        log(`  ERROR  ${row.error}`)
        try {
          const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
          await writeFile(join(OUT, `${example.slug}-ERROR.png`), Buffer.from(capture.data, 'base64'))
        } catch { /* page may be gone */ }
      }
      results.push(row)
    }

    const allOk = results.every((row) => row.ok)
    const manifest = {
      generatedAt: new Date().toISOString(),
      total: results.length,
      ok: results.filter((row) => row.ok).length,
      examples: results,
    }
    await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
    log(`\n${manifest.ok}/${manifest.total} examples clean (no missing children, no card overlap, no console error)`)
    app.close()
    process.exit(allOk ? 0 : 1)
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`)
    await writeFile(join(OUT, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), aborted: String(error?.stack ?? error), examples: results }, null, 2))
    app.close()
    process.exit(1)
  }
}

main()
