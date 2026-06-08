<#
.SYNOPSIS
  Run the Trellis2 Multi-View Mesh+Texturing pipeline via ComfyUI API.

.DESCRIPTION
  Takes 2-4 source images (front required, back/left/right optional)
  and produces a textured GLB mesh using microsoft/TRELLIS.2-4B.
  
  The workflow uses sdpa attention backend (Windows-compatible).

.PARAMETER FrontImage
  Path to the front view image (REQUIRED). Best: 3/4 elevated front.

.PARAMETER BackImage
  Path to the back view image (optional).

.PARAMETER LeftImage
  Path to the left/side view image (optional).

.PARAMETER RightImage
  Path to the right/side view image (optional).

.PARAMETER OutputName
  Filename prefix for the output GLB (default: "multiview_output").

.PARAMETER TargetFaces
  Target face count for mesh simplification (default: 200000).

.PARAMETER ComfyUrl
  ComfyUI API endpoint (default: http://127.0.0.1:8000).

.EXAMPLE
  .\run_multiview_trellis2.ps1 -FrontImage "D:\AI\input\ship_front.png" -BackImage "D:\AI\input\ship_back.png"
  
.EXAMPLE
  .\run_multiview_trellis2.ps1 -FrontImage "front.png" -BackImage "back.png" -LeftImage "left.png" -RightImage "right.png" -OutputName "my_ship" -TargetFaces 100000
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$FrontImage,
    
    [string]$BackImage = "",
    [string]$LeftImage = "",
    [string]$RightImage = "",
    [string]$OutputName = "multiview_output",
    [int]$TargetFaces = 200000,
    [string]$ComfyUrl = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"

# ── Validate inputs ──
if (-not (Test-Path $FrontImage)) {
    Write-Error "Front image not found: $FrontImage"
    exit 1
}

# Preprocess images to transparent PNG in ComfyUI input folder
$inputDir = "C:\AI\ComfiUi\ComfyUI_windows_portable\ComfyUI\input"
function Copy-ToInput($path, $name) {
    if ($path -and (Test-Path $path)) {
        $dest = Join-Path $inputDir $name
        # Run python preprocessing script to remove solid background
        & D:\AI\.venv\Scripts\python.exe assets/preprocess_images.py $path $dest | Out-Null
        return $name
    }
    return $null
}

Write-Host "`n=== Trellis2 Multi-View Pipeline ===" -ForegroundColor Magenta
Write-Host "Model: microsoft/TRELLIS.2-4B" -ForegroundColor DarkGray
Write-Host "Backend: sdpa (Windows)" -ForegroundColor DarkGray
Write-Host ""

$frontFile = Copy-ToInput $FrontImage "mv_front.png"
$backFile  = Copy-ToInput $BackImage  "mv_back.png"
$leftFile  = Copy-ToInput $LeftImage  "mv_left.png"
$rightFile = Copy-ToInput $RightImage "mv_right.png"

$viewCount = 1
if ($backFile)  { $viewCount++ }
if ($leftFile)  { $viewCount++ }
if ($rightFile) { $viewCount++ }
Write-Host "Views: $viewCount image(s) loaded" -ForegroundColor Green

# ── Build API prompt (parameter names match installed node versions) ──

$prompt = @{
    # Load Model
    "1" = @{
        class_type = "Trellis2LoadModel"
        inputs = @{
            modelname = "microsoft/TRELLIS.2-4B"
            backend = "sdpa"
            device = "cuda"
            low_vram = $false
            keep_models_loaded = $true
            conv_backend = "flex_gemm"
            sparse_backend = "flash_attn"
            use_reconviagen = $false
        }
    }
    # Front Image
    "2" = @{
        class_type = "Trellis2LoadImageWithTransparency"
        inputs = @{
            image = $frontFile
            upload = "image"
        }
    }
    # PreProcess Front
    "4" = @{
        class_type = "Trellis2PreProcessImage"
        inputs = @{
            image = @("2", 2)  # image_with_alpha output
            padding = 0
            remove_background = $false
            max_size = 2048
        }
    }
    # ImageCond MultiView Generator
    "6" = @{
        class_type = "Trellis2ImageCondMultiViewGenerator"
        inputs = @{
            pipeline = @("1", 0)
            front_image = @("4", 0)
        }
    }
    # Sparse MultiView Generator
    "21" = @{
        class_type = "Trellis2SparseMultiViewGenerator"
        inputs = @{
            pipeline = @("6", 3)
            image_conds = @("6", 0)
            views_list = @("6", 2)
            seed = 12345
            sparse_structure_steps = 30
            sparse_structure_guidance_strength = 6.5
            sparse_structure_guidance_rescale = 0.05
            sparse_structure_rescale_t = 4.0
            sparse_structure_sampler = "heun"
            sparse_structure_resolution = 32
            sparse_structure_guidance_interval_start = 0.1
            sparse_structure_guidance_interval_end = 1.0
            fill_holes = $true
            hole_iterations = 1
            verbose = $false
            dino_lock = 0.0
            dino_substeps = 4
            fill_holes_with_model = $true
            hole_fill_algorithm = "flood_fill"
            dino_foundation_cap = 1.0
            keep_only_shell = $true
            front_axis = "z"
            blend_temperature = 1.0
        }
    }
    # Shape MultiView Generator
    "19" = @{
        class_type = "Trellis2ShapeMultiViewGenerator"
        inputs = @{
            pipeline = @("21", 3)
            image_conds = @("6", 0)
            views_list = @("21", 2)
            coords = @("21", 0)
            resolution = 1024
            shape_steps = 30
            shape_guidance_strength = 6.5
            shape_guidance_rescale = 0.05
            shape_rescale_t = 4.0
            shape_sampler = "heun"
            shape_guidance_interval_start = 0.1
            shape_guidance_interval_end = 1.0
            verbose = $false
            dino_lock = 0.0
            dino_substeps = 4
            dino_foundation_cap = 1.0
            front_axis = "z"
            blend_temperature = 1.0
        }
    }
    # Shape Cascade MultiView Generator
    "20" = @{
        class_type = "Trellis2ShapeCascadeMultiViewGenerator"
        inputs = @{
            pipeline = @("19", 3)
            image_conds = @("6", 1)
            views_list = @("19", 2)
            shape_slat = @("19", 0)
            from_resolution = @("19", 1)
            to_resolution = 1024
            sparse_structure_resolution = @("21", 1)
            max_num_tokens = 999999
            shape_steps = 30
            shape_guidance_strength = 6.5
            shape_guidance_rescale = 0.05
            shape_rescale_t = 4.0
            shape_sampler = "heun"
            shape_guidance_interval_start = 0.1
            shape_guidance_interval_end = 1.0
            verbose = $false
            dino_lock = 0.0
            dino_substeps = 4
            dino_foundation_cap = 1.0
            front_axis = "z"
            blend_temperature = 1.0
        }
    }
    # TexSlat MultiView Generator
    "24" = @{
        class_type = "Trellis2TexSlatMultiViewGenerator"
        inputs = @{
            pipeline = @("20", 3)
            image_conds = @("6", 1)
            views_list = @("20", 2)
            shape_slat = @("20", 0)
            resolution = 1024
            texture_steps = 30
            texture_guidance_strength = 6.5
            texture_guidance_rescale = 0.05
            texture_rescale_t = 4.0
            texture_sampler = "heun"
            texture_guidance_interval_start = 0.0
            texture_guidance_interval_end = 0.9
            verbose = $false
            dino_lock = 0.0
            dino_substeps = 4
            dino_foundation_cap = 1.0
            front_axis = "z"
            blend_temperature = 1.0
        }
    }
    # Decode Latents
    "10" = @{
        class_type = "Trellis2DecodeLatents"
        inputs = @{
            pipeline = @("24", 2)
            shape_slat = @("20", 0)
            resolution = @("20", 1)
            use_tiled_decoder = $true
            texture_slat = @("24", 0)
        }
    }
    # Reconstruct Mesh with Quad
    "12" = @{
        class_type = "Trellis2ReconstructMeshWithQuad"
        inputs = @{
            mesh = @("10", 0)
            remesh_band = 1.0
            resolution = 1024
            remove_floaters = $true
            remove_inner_faces = $true
        }
    }
    # Simplify Mesh (pass 1)
    "13" = @{
        class_type = "Trellis2SimplifyMesh"
        inputs = @{
            mesh = @("12", 0)
            target_face_num = $TargetFaces
            method = "Cumesh"
        }
    }
    # Fill Holes
    "14" = @{
        class_type = "Trellis2FillHolesNicelyWithMeshlib"
        inputs = @{
            mesh = @("13", 0)
        }
    }
    # Simplify Mesh (pass 2)
    "15" = @{
        class_type = "Trellis2SimplifyMesh"
        inputs = @{
            mesh = @("14", 0)
            target_face_num = $TargetFaces
            method = "Cumesh"
        }
    }
    # Convert MeshWithVoxel to Trimesh for export
    # PostProcessMesh re-enabled (open3d now installed)
    "16" = @{
        class_type = "Trellis2PostProcessMesh"
        inputs = @{
            mesh = @("15", 0)
            remove_duplicate_faces = $true
            repair_non_manifold_edges = $true
            remove_non_manifold_faces = $false
            remove_small_connected_components = $true
            remove_small_connected_components_size = 0.00001
            unify_faces_orientation = $true
            remove_floaters = $true
            remove_infinite_vertices = $true
            merge_vertices = $true
            merge_distance = 0.001
            remove_nan_vertices = $true
        }
    }
    # UV Unwrap and Bake Textures
    "25" = @{
        class_type = "Trellis2UnWrapAndRasterizer"
        inputs = @{
            mesh = @("16", 0)
            mesh_cluster_threshold_cone_half_angle_rad = 60.0
            mesh_cluster_refine_iterations = 0
            mesh_cluster_global_iterations = 1
            mesh_cluster_smooth_strength = 1
            texture_size = 2048
            texture_alpha_mode = "OPAQUE"
            double_side_material = $false
            bake_on_vertices = $false
            use_custom_normals = $false
            bvh = @("10", 1)
            inpainting = "telea"
            reorient_vertices = "90 degrees"
        }
    }
    # Export Mesh
    "17" = @{
        class_type = "Trellis2ExportMesh"
        inputs = @{
            trimesh = @("25", 0)
            filename_prefix = $OutputName
            file_format = "glb"
        }
    }
}

# ── Add back image nodes if provided ──
if ($backFile) {
    $prompt["3"] = @{
        class_type = "Trellis2LoadImageWithTransparency"
        inputs = @{
            image = $backFile
            upload = "image"
        }
    }
    $prompt["5"] = @{
        class_type = "Trellis2PreProcessImage"
        inputs = @{
            image = @("3", 2)
            padding = 0
            remove_background = $false
            max_size = 2048
        }
    }
    $prompt["6"].inputs["back_image"] = @("5", 0)
}

# ── Add left image nodes if provided ──
if ($leftFile) {
    $prompt["30"] = @{
        class_type = "Trellis2LoadImageWithTransparency"
        inputs = @{
            image = $leftFile
            upload = "image"
        }
    }
    $prompt["31"] = @{
        class_type = "Trellis2PreProcessImage"
        inputs = @{
            image = @("30", 2)
            padding = 0
            remove_background = $false
            max_size = 2048
        }
    }
    $prompt["6"].inputs["left_image"] = @("31", 0)
}

# ── Add right image nodes if provided ──
if ($rightFile) {
    $prompt["32"] = @{
        class_type = "Trellis2LoadImageWithTransparency"
        inputs = @{
            image = $rightFile
            upload = "image"
        }
    }
    $prompt["33"] = @{
        class_type = "Trellis2PreProcessImage"
        inputs = @{
            image = @("32", 2)
            padding = 0
            remove_background = $false
            max_size = 2048
        }
    }
    $prompt["6"].inputs["right_image"] = @("33", 0)
}

# ── Submit to API ──
$body = @{ prompt = $prompt } | ConvertTo-Json -Depth 20 -Compress
Write-Host "`nSubmitting workflow to $ComfyUrl..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "$ComfyUrl/api/prompt" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
    $result = $response.Content | ConvertFrom-Json
    $promptId = $result.prompt_id
    Write-Host "Queued! Prompt ID: $promptId" -ForegroundColor Green
    Write-Host ""
    Write-Host "Output will be saved to: D:\AI\output\${OutputName}_00001_.glb" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Monitor progress:" -ForegroundColor DarkGray
    Write-Host "  ComfyUI logs: Check the ComfyUI terminal window" -ForegroundColor DarkGray
    Write-Host "  API status:   Invoke-WebRequest '$ComfyUrl/api/queue'" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Estimated time: 3-8 minutes (RTX 3090)" -ForegroundColor DarkGray
} catch {
    Write-Error "Failed to submit workflow: $_"
    Write-Host "`nIs ComfyUI running at $ComfyUrl ?" -ForegroundColor Red
    exit 1
}
