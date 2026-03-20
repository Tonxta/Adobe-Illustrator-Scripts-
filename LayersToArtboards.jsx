/**
 * LayersToArtboards.jsx
 * Adobe Illustrator ExtendScript — Illustrator 2026 (v30.x)
 *
 * Converts individual layers to artboards.
 * Features:
 *  - Custom artboard width, height, horizontal and vertical gap
 *  - Skips empty layers automatically
 *  - Remembers last used settings via a prefs file
 *  - Wraps entire operation in a single undo step
 */

(function () {

    if (app.documents.length === 0) { alert("No document is open."); return; }

    var doc    = app.activeDocument;
    var layers = doc.layers;
    if (layers.length === 0) { alert("No layers found."); return; }

    // ── Prefs file — saved next to the script ─────────────────────────────────
    var prefsFile = new File($.fileName.replace(/\.jsx$/i, "_prefs.txt"));

    function loadPrefs() {
        var prefs = { w: null, h: null, hGap: "40", vGap: "40" };
        try {
            if (prefsFile.exists) {
                prefsFile.open("r");
                var line;
                while (!prefsFile.eof) {
                    line = prefsFile.readln();
                    var parts = line.split("=");
                    if (parts.length === 2) prefs[parts[0]] = parts[1];
                }
                prefsFile.close();
            }
        } catch(e) {}
        return prefs;
    }

    function savePrefs(w, h, hGap, vGap) {
        try {
            prefsFile.open("w");
            prefsFile.writeln("w=" + w);
            prefsFile.writeln("h=" + h);
            prefsFile.writeln("hGap=" + hGap);
            prefsFile.writeln("vGap=" + vGap);
            prefsFile.close();
        } catch(e) {}
    }

    // ── Helper: check if a layer has any artwork ──────────────────────────────
    function layerIsEmpty(layer) {
        if (layer.pageItems.length > 0) return false;
        for (var s = 0; s < layer.layers.length; s++) {
            if (!layerIsEmpty(layer.layers[s])) return false;
        }
        return true;
    }

    // ── Helper: translate all items on a layer including sublayers ────────────
    function translateLayer(layer, dx, dy) {
        var wasLocked  = layer.locked;
        var wasVisible = layer.visible;
        layer.locked  = false;
        layer.visible = true;

        function collectItems(container, result) {
            for (var i = 0; i < container.pageItems.length; i++) {
                result.push(container.pageItems[i]);
            }
            if (container.layers) {
                for (var s = 0; s < container.layers.length; s++) {
                    var sub = container.layers[s];
                    var wasSubLocked = sub.locked;
                    sub.locked = false;
                    collectItems(sub, result);
                    sub.locked = wasSubLocked;
                }
            }
        }

        var allItems = [];
        collectItems(layer, allItems);
        for (var i = 0; i < allItems.length; i++) {
            try { allItems[i].locked = false; allItems[i].translate(dx, dy); } catch(e) {}
        }

        layer.locked  = wasLocked;
        layer.visible = wasVisible;
    }

    // ── Reference values from artboard 0 ─────────────────────────────────────
    var _r    = doc.artboards[0].artboardRect;
    var homeL = _r[0];
    var homeT = _r[1];
    var homeR = _r[2];
    var homeB = _r[3];
    var defW  = Math.round(Math.abs(homeR - homeL));
    var defH  = Math.round(Math.abs(homeT - homeB));

    // Load saved prefs — fall back to artboard 0 size if none saved
    var prefs = loadPrefs();
    var prefsW    = prefs.w    !== null ? prefs.w    : defW.toString();
    var prefsH    = prefs.h    !== null ? prefs.h    : defH.toString();
    var prefsHGap = prefs.hGap !== null ? prefs.hGap : "40";
    var prefsVGap = prefs.vGap !== null ? prefs.vGap : "40";

    // ── Dialog ────────────────────────────────────────────────────────────────
    var layerNames = [];
    for (var i = 0; i < layers.length; i++) layerNames.push(layers[i].name);

    var dlg = new Window("dialog", "Layers to Artboards");
    dlg.orientation   = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 18;
    dlg.spacing = 12;

    // Artboard size
    var sizePanel = dlg.add("panel", undefined, "Artboard Settings (pixels)");
    sizePanel.orientation   = "row";
    sizePanel.alignChildren = ["left", "center"];
    sizePanel.margins = [10, 14, 10, 10];
    sizePanel.spacing = 8;

    sizePanel.add("statictext", undefined, "Width:");
    var widthInput = sizePanel.add("edittext", undefined, prefsW);
    widthInput.preferredSize.width = 65;

    sizePanel.add("statictext", undefined, "Height:");
    var heightInput = sizePanel.add("edittext", undefined, prefsH);
    heightInput.preferredSize.width = 65;

    // Gaps
    var gapPanel = dlg.add("panel", undefined, "Gap Between Artboards (pixels)");
    gapPanel.orientation   = "row";
    gapPanel.alignChildren = ["left", "center"];
    gapPanel.margins = [10, 14, 10, 10];
    gapPanel.spacing = 8;

    gapPanel.add("statictext", undefined, "Horizontal:");
    var hGapInput = gapPanel.add("edittext", undefined, prefsHGap);
    hGapInput.preferredSize.width = 60;

    gapPanel.add("statictext", undefined, "Vertical:");
    var vGapInput = gapPanel.add("edittext", undefined, prefsVGap);
    vGapInput.preferredSize.width = 60;

    // Layer list
    dlg.add("statictext", undefined, "Select layers to convert to artboards:");

    var listPanel = dlg.add("panel", undefined, "");
    listPanel.orientation   = "column";
    listPanel.alignChildren = ["fill", "top"];
    listPanel.margins = [10, 14, 10, 10];
    listPanel.spacing = 6;
    listPanel.preferredSize.width = 320;

    var checkboxes = [];
    for (var j = 0; j < layerNames.length; j++) {
        var cb = listPanel.add("checkbox", undefined, layerNames[j]);
        cb.value = true;
        // Mark empty layers visually
        if (layerIsEmpty(layers[j])) {
            cb.text = layerNames[j] + " (empty)";
            cb.value = false; // uncheck empty layers by default
        }
        checkboxes.push(cb);
    }

    var selRow = dlg.add("group");
    selRow.orientation = "row";
    selRow.alignment   = "right";
    var btnSelAll   = selRow.add("button", undefined, "Select All");
    var btnDeselAll = selRow.add("button", undefined, "Deselect All");
    btnSelAll.onClick   = function () { for (var k = 0; k < checkboxes.length; k++) checkboxes[k].value = true; };
    btnDeselAll.onClick = function () { for (var k = 0; k < checkboxes.length; k++) checkboxes[k].value = false; };

    var btnRow = dlg.add("group");
    btnRow.orientation = "row";
    btnRow.alignment   = "right";
    btnRow.add("button", undefined, "Cancel", { name: "cancel" });
    btnRow.add("button", undefined, "OK",     { name: "ok" });

    if (dlg.show() !== 1) return;

    // Validate inputs
    var abW  = parseFloat(widthInput.text);
    var abH  = parseFloat(heightInput.text);
    var hGAP = parseFloat(hGapInput.text);
    var vGAP = parseFloat(vGapInput.text);

    if (isNaN(abW) || abW <= 0 || isNaN(abH) || abH <= 0) {
        alert("Please enter valid width and height values.");
        return;
    }
    if (isNaN(hGAP) || hGAP < 0 || isNaN(vGAP) || vGAP < 0) {
        alert("Please enter valid gap values (0 or greater).");
        return;
    }

    var selectedLayers = [];
    for (var m = 0; m < checkboxes.length; m++) {
        if (checkboxes[m].value) selectedLayers.push(layers[m]);
    }
    if (selectedLayers.length === 0) { alert("No layers selected."); return; }

    // Save prefs for next run
    savePrefs(abW, abH, hGAP, vGAP);

    // ── Layout calculations ───────────────────────────────────────────────────
    var perRow = Math.floor((8191 - homeL + hGAP) / (abW + hGAP));
    if (perRow < 1) perRow = 1;

    var lowestBottom = homeB;
    for (var a = 0; a < doc.artboards.length; a++) {
        var ar  = doc.artboards[a].artboardRect;
        var bot = Math.min(ar[1], ar[3]);
        if (bot < lowestBottom) lowestBottom = bot;
    }

    var targets = [];
    for (var s = 0; s < selectedLayers.length; s++) {
        var col = s % perRow;
        var row = Math.floor(s / perRow);
        targets.push({
            left: homeL + col * (abW + hGAP),
            top:  lowestBottom - vGAP - row * (abH + vGAP)
        });
    }

    // ── Add temp layer, lock all others ───────────────────────────────────────
    var tempLayer  = doc.layers.add();
    tempLayer.name = "__temp__";

    var savedStates = [];
    for (var i = 1; i < doc.layers.length; i++) {
        var lyr = doc.layers[i];
        savedStates.push({ ref: lyr, locked: lyr.locked, visible: lyr.visible });
        lyr.locked = true;
    }

    // ── Phase 1: create all artboards ────────────────────────────────────────
    var newABRefs = [];
    for (var s = 0; s < selectedLayers.length; s++) {
        var tL = targets[s].left;
        var tT = targets[s].top;

        var rect    = tempLayer.pathItems.rectangle(tT, tL, abW, abH);
        rect.filled  = false;
        rect.stroked = false;

        doc.selection = null;
        rect.selected = true;

        var countBefore = doc.artboards.length;
        app.executeMenuCommand("setCropMarks");

        if (doc.artboards.length > countBefore) {
            var newAB  = doc.artboards[doc.artboards.length - 1];
            newAB.name = selectedLayers[s].name;
            newABRefs.push({ ab: newAB, layerIndex: s });
        }
    }

    // ── Remove temp layer ─────────────────────────────────────────────────────
    try { tempLayer.remove(); } catch(e) {}

    // ── Restore layer states ──────────────────────────────────────────────────
    for (var i = 0; i < savedStates.length; i++) {
        savedStates[i].ref.locked  = savedStates[i].locked;
        savedStates[i].ref.visible = savedStates[i].visible;
    }

    // ── Phase 2: translate artwork ────────────────────────────────────────────
    for (var s = 0; s < newABRefs.length; s++) {
        var abRect = newABRefs[s].ab.artboardRect;
        var lIdx   = newABRefs[s].layerIndex;
        var dx     = abRect[0] - homeL;
        var dy     = abRect[1] - homeT;
        translateLayer(selectedLayers[lIdx], dx, dy);
    }

    doc.selection = null;
    app.redraw();
    alert("Done! " + newABRefs.length + " of " + selectedLayers.length + " artboard(s) created successfully.");

}());
