# FINGER S1.0 — Hyper-Real Anatomical Sculpting, Joint & Dermal-SSS Graphics Engine

**FINGER S1.0** (`src/graphics/FingerS1Engine.ts`) is JANKEN · 極's dedicated anatomical graphics mode engineered to push hand geometry, joint realism, skin micro-relief, and optical subsurface scattering from stylized articulated craft into uncanny lifelike physical fidelity — while remaining 100% compatible with **KHDR** and **Shadow Flame 1.0 (Flash & Pro)**.

---

## 1. Asymmetric Anatomically Sculpted 3D Geometry (`32 × 24` Parametric Meshes)

Unlike doll-like symmetrical cylinders and exposed ball joints, FINGER S1.0 sculpts every phalanx, joint, nail, and metacarpal surface directly from human hand morphology:

- **Asymmetric Phalanges (`createFingerS1PhalanxGeo`)**:
  - **Dorsal ridge**: subtly flattened extensor plane with delicate bony condylar silhouette.
  - **Volar fat & pulp pads**: plump, organically rounded soft-tissue contour on the underside of proximal/middle phalanges and rich rounded distal fingertip pulp pads.
  - **Diaphysis waist & bicondylar flares**: slender mid-shaft waist widening smoothly into proximal/distal articular heads.
  - **Recessed anatomical nail bed**: concave dorsal matrix bed on every distal phalanx framed by raised **lateral paronychium nail folds** and a proximal **eponychium cuticle rim**.
- **Seamless Anatomical Joint Capsules (`createFingerS1JointCapsuleGeo`)**:
  - Replaces spherical mechanical joints on organic hands with continuous skin-wrapped bicondylar capsules featuring twin dorsal condyle contours and a volar flexion tuck.
- **Dynamic 3-Layer Concentric Dorsal Knuckle Wrinkle Stacks (`createFingerS1KnuckleWrinkleStackGeo`)**:
  - Mounted over every MCP and PIP dorsal joint and driven live by `JHandSolvedFrame.fingers[fn].knuckleCreaseStretch`:
    - **Extension**: skin folds compress closer and rise subtly with authentic elliptical knuckle pleats.
    - **Flexion**: ridges stretch smoothly flat and elongate tautly across the bent knuckle!
- **Dual-Curvature Anatomical Nail Plates (`createFingerS1NailPlateGeo`)**:
  - Combines transverse C-curve arch + subtle longitudinal arch + rounded distal free-edge contour, nested flush into the recessed nail bed (`ior: 1.53`, `clearcoat: 0.94`).
- **Continuous Sculpted Palm (`createFingerS1SculptedPalmGeo`)**:
  - Organic trapezoidal hand body with concave volar hollow, dorsal metacarpal arch, and seamless carpal wrist transition.

---

## 2. Procedural Micro-Anatomy PBR Texture Suite (`getFingerS1TextureSet`)

Generated deterministically once at boot (zero external texture downloads, shared GPU singleton):

| Map | Anatomical Micro-Features |
|---|---|
| `fingerAlbedoMap` / `fingerNormalMap` / `fingerRoughnessMap` | UV-aligned (`u=0/1` dorsal, `u=0.5` volar): **Rete Cutis** diamond skin grid & pores, concentric dorsal knuckle furrows, crisp volar flexion creases, authentic **whorl/loop fingertip dermatoglyphics (fingerprints)**, natural knuckle/tip hemoglobin blush, spatial sebum roughness (`0.34..0.74`). |
| `palmAlbedoMap` / `palmNormalMap` / `palmRoughnessMap` | Major palmar creases (Life / Head / Heart lines), Rete Cutis micro-pores, subtle desaturated subcutaneous **dorsal venous arch**, mottled natural dermal tone. |
| `nailAlbedoMap` / `nailNormalMap` | Rosy translucent nail bed, creamy-ivory **lunula** half-moon at the matrix, onychodermal pink transition band, ivory-white distal **free edge**, and microscopic longitudinal nail striations. |

---

## 3. Custom GLSL Optical Subsurface Scattering & Live Knuckle Blanching

`enhanceMaterialWithFingerS1Shader` patches `MeshPhysicalMaterial` via `onBeforeCompile` (touching only `#include <common>` and `#include <dithering_fragment>` so **Shadow Flame 1.0**'s global shadowmap patch remains 100% intact):

1. **Pre-Integrated Hemoglobin Wrap-Scattering**: softens the harsh Lambertian shadow terminator with warm crimson-peach dermal scatter.
2. **Backlit Dermal Translucency**: physically grounded warm lantern-light scatter through thin fingertips and interdigital webbing (zero neon!).
3. **Real-Time Knuckle Tension Blanching (`uS1Effort`)**: coupled directly to `JHandKinesisEngine`'s `muscleEffort` (`0..1`) — clenching a fist subtly blanches stretched dorsal knuckle skin warmer ivory, then flushes back warmly upon release!
4. **Velvety Vellus Peach-Fuzz Grazing Sheen**: delicate warm micro-sheen at oblique grazing angles.

---

## 4. Framerate-Invariant `AnalyticSpring` (Exact Closed-Form C² Motion)

FINGER S1.0 also supplies `AnalyticSpring`, solving $\ddot{x} + d\dot{x} + k(x - x_{\text{target}}) = 0$ analytically in closed form across underdamped, critically damped, and overdamped regimes. Combined with `JHandKinesisEngine`'s 6× sub-stepped C² Quintic target blending, arm, finger, and Steadicam camera motion achieve identical, liquid-smooth ("ぬるぬる") trajectories at **60 / 120 / 240 / Unlimited FPS**.
