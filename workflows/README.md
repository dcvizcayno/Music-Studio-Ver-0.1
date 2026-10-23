# ComfyUI Workflows for YuE2 Song Studio

This folder stores the API-format execution graphs sent to ComfyUI's `POST /prompt` endpoint.

## How to Export Workflows in API Format from ComfyUI

ComfyUI has two workflow formats:
1. **UI Format** (default `Save` button): Contains UI coordinates, canvas links, node layout, but lacks the direct prompt graph structure needed for programmatic API submission.
2. **API Format** (`Save (API Format)`): A dictionary of node IDs mapped directly to their inputs and values, strictly required by ComfyUI's backend API.

### Enabling "Save (API Format)" in ComfyUI:
1. Open ComfyUI in your browser (usually `http://127.0.0.1:8188`).
2. Click the gear icon (**Settings**) in the ComfyUI menu bar.
3. Check the box labeled **"Enable Dev mode Options"**.
4. Close the Settings modal.
5. You will now see a new button in the right-hand panel labeled **"Save (API Format)"**.
6. When your YuE2 workflow is configured, click **"Save (API Format)"** and save the JSON file here in `./workflows/`.

### Mapping Parameters to UI Inputs
For each workflow file `name.json`, provide a companion `name.mapping.json` that binds UI controls to the specific node ID and input parameter name. See `text_to_song.mapping.json` for reference.
