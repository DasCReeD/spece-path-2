"""
Decimate the symmetrized mesh for game use, then export for Trellis2 retexturing.
"""
import bpy
import os

BLEND_PATH = r"C:\dev\Sky roads\assets\ship_symmetrized.blend"
EXPORT_GAME = r"C:\dev\Sky roads\assets\ship_game.glb"
EXPORT_RETEX = r"D:\AI\input\ship_for_retexture.glb"
DECIMATE_TARGET = 50000  # target face count

# Find mesh
mesh_obj = None
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        mesh_obj = obj
        break

print(f"Found: {mesh_obj.name} — {len(mesh_obj.data.vertices):,} verts, {len(mesh_obj.data.polygons):,} faces")

bpy.ops.object.select_all(action='DESELECT')
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = mesh_obj

# Calculate decimate ratio
current_faces = len(mesh_obj.data.polygons)
ratio = DECIMATE_TARGET / current_faces
print(f"\nDecimating: {current_faces:,} → ~{DECIMATE_TARGET:,} faces (ratio: {ratio:.4f})")

mod = mesh_obj.modifiers.new("Decimate", 'DECIMATE')
mod.ratio = ratio
bpy.ops.object.modifier_apply(modifier="Decimate")

print(f"  Result: {len(mesh_obj.data.vertices):,} verts, {len(mesh_obj.data.polygons):,} faces")

# Clean up after decimation
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')

# Export for game
os.makedirs(os.path.dirname(EXPORT_GAME), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=EXPORT_GAME,
    use_selection=True,
    export_format='GLB',
    export_apply=True,
)
size_mb = os.path.getsize(EXPORT_GAME) / (1024 * 1024)
print(f"\nGame mesh: {EXPORT_GAME} ({size_mb:.1f} MB)")

# Also export to ComfyUI input for retexturing
os.makedirs(os.path.dirname(EXPORT_RETEX), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=EXPORT_RETEX,
    use_selection=True,
    export_format='GLB',
    export_apply=True,
)
print(f"Retexture mesh: {EXPORT_RETEX}")

# Save blend
bpy.ops.wm.save_as_mainfile(filepath=r"C:\dev\Sky roads\assets\ship_game.blend")
print(f"Saved: ship_game.blend")
print("\nDone!")
