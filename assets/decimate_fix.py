"""
Blender CLI — Decimate + Fix Geometry
Run on any GLB to make it game-ready.

Usage:
  blender --background --python decimate_fix.py -- input.glb output.glb [target_faces]
  
  Or just edit the CONFIG below and run:
  blender --background --python decimate_fix.py
"""
import bpy
import bmesh
import os
import sys

# ============================================================
# CONFIG
# ============================================================
INPUT_GLB = r"C:\dev\Sky roads\assets\ship_cleaned.glb"
OUTPUT_GLB = r"C:\dev\Sky roads\assets\ship_final.glb"
OUTPUT_BLEND = r"C:\dev\Sky roads\assets\ship_final.blend"
TARGET_FACES = 50000

# Parse command line args if provided (after --)
argv = sys.argv
if "--" in argv:
    args = argv[argv.index("--") + 1:]
    if len(args) >= 1:
        INPUT_GLB = args[0]
    if len(args) >= 2:
        OUTPUT_GLB = args[1]
    if len(args) >= 3:
        TARGET_FACES = int(args[2])


# ============================================================
# FUNCTIONS
# ============================================================

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)


def import_glb(path):
    if not os.path.exists(path):
        print(f"ERROR: File not found: {path}")
        sys.exit(1)
    
    bpy.ops.import_scene.gltf(filepath=path)
    
    meshes = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    if not meshes:
        print("ERROR: No mesh found in file!")
        sys.exit(1)
    
    # Join all meshes into one
    if len(meshes) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for m in meshes:
            m.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
    
    obj = bpy.context.active_object
    return obj


def fix_geometry(obj):
    """Comprehensive geometry fixes."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    
    # Apply transforms
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    
    # 1. Remove duplicate vertices
    bpy.ops.mesh.remove_doubles(threshold=0.0001)
    print("  [x] Merged duplicate vertices")
    
    # 2. Remove loose geometry
    bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=True)
    print("  [x] Removed loose geometry")
    
    # 3. Dissolve degenerate faces (zero-area)
    bpy.ops.mesh.dissolve_degenerate(threshold=0.0001)
    print("  [x] Dissolved degenerate faces")
    
    # 4. Fill holes — select non-manifold edges and fill
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.mesh.select_non_manifold(extend=False)
    
    # Count non-manifold
    bm = bmesh.from_edit_mesh(obj.data)
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    print(f"  [x] Found {non_manifold} non-manifold edges")
    
    if non_manifold > 0 and non_manifold < 2000:
        try:
            bpy.ops.mesh.fill_holes(sides=4)
            print("  [x] Filled small holes")
        except Exception:
            print("  [!] Could not auto-fill holes (complex geometry)")
    
    # 6. Fix normals
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    print("  [x] Recalculated normals")
    
    # 7. Smooth shading
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_smooth()
    
    # Auto smooth normals (sharp edges preserved)
    if hasattr(obj.data, 'use_auto_smooth'):
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = 0.523599  # 30 degrees
    print("  [x] Applied smooth shading with auto-smooth")


def decimate_mesh(obj, target_faces):
    """Smart decimation that preserves shape."""
    current = len(obj.data.polygons)
    
    if current <= target_faces:
        print(f"  Already at {current:,} faces (target: {target_faces:,}), skipping")
        return
    
    ratio = target_faces / current
    
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    
    # Use collapse decimation (best quality)
    mod = obj.modifiers.new("Decimate", 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_collapse_triangulate = False
    bpy.ops.object.modifier_apply(modifier="Decimate")
    
    after = len(obj.data.polygons)
    print(f"  [x] Decimated: {current:,} → {after:,} faces")
    
    # Clean up after decimation
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0001)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    print("  [x] Post-decimate cleanup done")


def center_and_ground(obj):
    """Center object and place on ground plane."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    obj.location = (0, 0, 0)
    bpy.ops.object.transform_apply(location=True)
    
    # Drop to ground
    min_z = min(v.co.z for v in obj.data.vertices)
    if abs(min_z) > 0.001:
        for v in obj.data.vertices:
            v.co.z -= min_z
    
    print("  [x] Centered and grounded")


def export(obj, glb_path, blend_path=None):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    
    os.makedirs(os.path.dirname(glb_path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        use_selection=True,
        export_format='GLB',
        export_apply=True,
    )
    size_mb = os.path.getsize(glb_path) / (1024 * 1024)
    print(f"  [x] GLB: {glb_path} ({size_mb:.1f} MB)")
    
    if blend_path:
        bpy.ops.wm.save_as_mainfile(filepath=blend_path)
        print(f"  [x] Blend: {blend_path}")


# ============================================================
# MAIN
# ============================================================

def main():
    print("\n" + "=" * 60)
    print("  Decimate + Fix Geometry Pipeline")
    print("=" * 60)
    print(f"  Input:  {INPUT_GLB}")
    print(f"  Output: {OUTPUT_GLB}")
    print(f"  Target: {TARGET_FACES:,} faces")
    print("=" * 60)
    
    print("\n[1/5] Importing...")
    clear_scene()
    obj = import_glb(INPUT_GLB)
    print(f"  Loaded: {len(obj.data.vertices):,} verts, {len(obj.data.polygons):,} faces")
    
    print("\n[2/5] Fixing geometry...")
    fix_geometry(obj)
    print(f"  After fix: {len(obj.data.vertices):,} verts, {len(obj.data.polygons):,} faces")
    
    print("\n[3/5] Decimating...")
    decimate_mesh(obj, TARGET_FACES)
    
    print("\n[4/5] Centering and grounding...")
    center_and_ground(obj)
    
    print("\n[5/5] Exporting...")
    export(obj, OUTPUT_GLB, OUTPUT_BLEND)
    
    print("\n" + "=" * 60)
    print(f"  DONE! Final: {len(obj.data.vertices):,} verts, {len(obj.data.polygons):,} faces")
    print("=" * 60)


if __name__ == "__main__":
    main()
