"""
Blender post-processing script for Trellis2 raw GLB output.
Runs: cleanup → decimate → weighted normals → triangulate → re-export.

Usage:
  blender --background --python blender_postprocess.py -- input.glb output.glb [target_tris]
"""

import bpy
import math
import sys
import os

def get_args():
    """Parse arguments after '--' separator."""
    argv = sys.argv
    if "--" in argv:
        args = argv[argv.index("--") + 1:]
    else:
        args = []
    
    if len(args) < 2:
        print("Usage: blender --background --python blender_postprocess.py -- input.glb output.glb [target_tris]")
        sys.exit(1)
    
    input_path = args[0]
    output_path = args[1]
    target_tris = int(args[2]) if len(args) > 2 else 10000
    
    return input_path, output_path, target_tris


def clear_scene():
    """Remove all objects from the scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()


def import_glb(filepath):
    """Import a GLB file."""
    print(f"\n=== Importing: {filepath} ===")
    bpy.ops.import_scene.gltf(filepath=filepath)
    
    imported = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    if not imported:
        print("[ERROR] No mesh objects found in GLB")
        sys.exit(1)
    
    print(f"  Found {len(imported)} mesh object(s)")
    return imported


def join_meshes(mesh_objects):
    """Join all mesh objects into one."""
    if len(mesh_objects) <= 1:
        obj = mesh_objects[0]
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        return obj
    
    # Select all mesh objects
    bpy.ops.object.select_all(action='DESELECT')
    for o in mesh_objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]
    
    # Join
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = "processed_mesh"
    print(f"  Joined {len(mesh_objects)} objects into one")
    return obj


def cleanup_mesh(obj):
    """Remove duplicate verts, fix normals, remove loose geometry."""
    print("\n=== Mesh Cleanup ===")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    
    # Get initial stats
    initial_verts = len(obj.data.vertices)
    initial_faces = len(obj.data.polygons)
    print(f"  Before: {initial_verts} verts, {initial_faces} faces")
    
    # Enter edit mode
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    
    # Merge duplicate vertices
    bpy.ops.mesh.remove_doubles(threshold=0.0001)
    
    # Remove loose vertices/edges
    bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=False)
    
    # Recalculate normals outward
    bpy.ops.mesh.normals_make_consistent(inside=False)
    
    # Fill small holes (non-manifold edges)
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.mesh.select_non_manifold()
    
    # Back to object mode
    bpy.ops.object.mode_set(mode='OBJECT')
    
    final_verts = len(obj.data.vertices)
    final_faces = len(obj.data.polygons)
    removed_verts = initial_verts - final_verts
    print(f"  After:  {final_verts} verts, {final_faces} faces")
    print(f"  Removed {removed_verts} duplicate/loose vertices")


def center_pivot(obj):
    """Center pivot to bottom-center of the mesh."""
    print("\n=== Centering Pivot ===")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    
    # Get bounding box in world space
    bbox = [obj.matrix_world @ bpy.mathutils.Vector(corner) for corner in obj.bound_box]  
    
    min_x = min(v.x for v in bbox)
    max_x = max(v.x for v in bbox)
    min_y = min(v.y for v in bbox)
    max_y = max(v.y for v in bbox)
    min_z = min(v.z for v in bbox)
    
    center_x = (min_x + max_x) / 2.0
    center_y = (min_y + max_y) / 2.0
    
    # Set cursor to bottom center
    bpy.context.scene.cursor.location = (center_x, center_y, min_z)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR', center='MEDIAN')
    
    # Move to world origin
    obj.location = (0, 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    
    dims = obj.dimensions
    print(f"  Dimensions: {dims.x:.3f} x {dims.y:.3f} x {dims.z:.3f}")
    print(f"  Pivot set to bottom-center")


def apply_modifiers(obj, target_tris):
    """Apply decimate, weighted normals, triangulate."""
    print(f"\n=== Applying Modifiers (target: {target_tris} tris) ===")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    
    # Count current triangles
    current_tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f"  Current triangles: {current_tris}")
    
    # 1. Decimate if needed
    if current_tris > target_tris:
        ratio = target_tris / current_tris
        dec = obj.modifiers.new(name="Decimate", type='DECIMATE')
        dec.decimate_type = 'COLLAPSE'
        dec.ratio = ratio
        print(f"  Decimate ratio: {ratio:.4f} ({current_tris} -> ~{target_tris})")
    else:
        print(f"  Skipping decimate (already under target)")
    
    # 2. Smooth by Angle (Blender 4.1+)
    try:
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(30.0)
    except AttributeError:
        # Blender 4.1+ / 5.x
        try:
            smooth = obj.modifiers.new(name="SmoothByAngle", type='SMOOTH_BY_ANGLE')
            smooth.angle = math.radians(30.0)
            print(f"  Smooth by Angle: 30°")
        except Exception:
            print(f"  [WARN] Could not add smooth modifier")
    
    # 3. Weighted Normal
    try:
        wn = obj.modifiers.new(name="WeightedNormal", type='WEIGHTED_NORMAL')
        wn.keep_sharp = True
        wn.weight_mode = 'FACE_AREA'
        print(f"  Weighted Normal: Face Area, Keep Sharp")
    except Exception:
        print(f"  [WARN] Could not add weighted normal modifier")
    
    # 4. Triangulate
    tri = obj.modifiers.new(name="Triangulate", type='TRIANGULATE')
    tri.quad_method = 'SHORTEST_DIAGONAL'
    tri.ngon_method = 'BEAUTY'
    print(f"  Triangulate: Shortest Diagonal / Beauty")
    
    # Apply all modifiers
    for mod in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
            print(f"  Applied: {mod.name}")
        except Exception as e:
            print(f"  [WARN] Could not apply {mod.name}: {e}")
    
    final_tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    final_verts = len(obj.data.vertices)
    print(f"\n  Final: {final_verts} verts, {final_tris} tris")


def export_glb(obj, output_path):
    """Export as optimized GLB."""
    print(f"\n=== Exporting: {output_path} ===")
    
    # Ensure only our object is selected
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    
    # Export
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True
    )
    
    file_size = os.path.getsize(output_path)
    print(f"  Saved: {output_path} ({file_size / 1024:.0f} KB)")


def main():
    input_path, output_path, target_tris = get_args()
    
    print("\n" + "=" * 60)
    print("  Blender Post-Processing Pipeline")
    print("  Trellis2 GLB -> Game-Ready GLB")
    print("=" * 60)
    
    # Need mathutils for Vector operations
    import mathutils
    bpy.mathutils = mathutils
    
    clear_scene()
    meshes = import_glb(input_path)
    obj = join_meshes(meshes)
    cleanup_mesh(obj)
    center_pivot(obj)
    apply_modifiers(obj, target_tris)
    export_glb(obj, output_path)
    
    print("\n=== DONE ===\n")


if __name__ == "__main__":
    main()
