"use strict";

//JS
import { d2Get, d2Patch } from "./js/d2api.js";
import $ from "jquery";
import M from "materialize-css";

//CSS
import "./css/style.css";
import "./css/header.css";
import "materialize-css/dist/css/materialize.min.css";

let mergedData = {};
let selectedFields = {
    name: true,
    shortName: true,
    code: true,
    description: true
};

// Function to highlight leading, trailing, and double spaces
function highlightSpaces(string) {
    if (string) {
        return string.replace(/(^\s+)|(\s+$)|(\s{2,})/g, function(match) {
            const highlightedSpaces = match.replace(/ /g, "&nbsp;");
            return `<span class="whitespace-highlight">${highlightedSpaces}</span>`;
        });
    }
    return string;
}


// Function to quote a string
function quoteString(string) {
    return string ? `"${string}"` : "";
}


function createFieldSelector() {
    if ($(".field-selector").length > 0) {
        updateFieldSelectorUI();
        return;
    }
    const $fieldSelector = $(`
        <div class="field-selector" style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
            <h6>Select Fields to Process:</h6>
            <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                <label>
                    <input type="checkbox" id="field-name" ${selectedFields.name ? "checked" : ""} />
                    <span>Name</span>
                </label>
                <label>
                    <input type="checkbox" id="field-shortName" ${selectedFields.shortName ? "checked" : ""} />
                    <span>Short Name</span>
                </label>
                <label>
                    <input type="checkbox" id="field-code" ${selectedFields.code ? "checked" : ""} />
                    <span>Code (WARNING: can break metadata relations)</span>
                </label>
                <label>
                    <input type="checkbox" id="field-description" ${selectedFields.description ? "checked" : ""} />
                    <span>Description</span>
                </label>
            </div>
        </div>
    `);

    $fieldSelector.find("input[type=\"checkbox\"]").on("change", function() {
        updateFieldSelection();
    });
    
    $("#table-tabs").before($fieldSelector);
}

function updateFieldSelectorUI() {
    $("#field-name").prop("checked", selectedFields.name);
    $("#field-shortName").prop("checked", selectedFields.shortName);
    $("#field-code").prop("checked", selectedFields.code);
    $("#field-description").prop("checked", selectedFields.description);
}

function updateFieldSelection() {
    selectedFields.name = $("#field-name").is(":checked");
    selectedFields.shortName = $("#field-shortName").is(":checked");
    selectedFields.code = $("#field-code").is(":checked");
    selectedFields.description = $("#field-description").is(":checked");
    
    M.toast({html: "Field selection updated", classes: "blue"});
}


// Fetch and render metadata
async function fetchAndRenderMetadata() {
    $("#loading-indicator").show(); // Show loading indicator
    $(".determinate").css("width", "0%"); // Initialize progress

    try {
        var requests = [];
        var types = ["name", "code", "description"];

        types.forEach(function (type) {
            requests.push(
                d2Get(`/api/metadata.json?filter=${type}:ilike:%20%20&fields=id,name,shortName,code,description`),
                d2Get(`/api/metadata.json?filter=${type}:$ilike:%20&fields=id,name,shortName,code,description`),
                d2Get(`/api/metadata.json?filter=${type}:ilike$:%20&fields=id,name,shortName,code,description`)
            );
        });

        const totalRequests = requests.length;
        let completedRequests = 0;

        const updateProgress = () => {
            completedRequests++;
            const progress = (completedRequests / totalRequests) * 100;
            $(".determinate").css("width", `${progress}%`);
        };

        const responses = await Promise.all(requests.map(request => request.then(response => {
            updateProgress();
            return response;
        })));

        mergedData = {};
        responses.forEach(function (data) {
            for (var key in data) {
                if (key === "system") continue;
                if (!mergedData[key]) mergedData[key] = [];
                mergedData[key] = mergedData[key].concat(data[key]);
            }
        });

        // Remove duplicates
        for (var key in mergedData) {
            mergedData[key] = mergedData[key].filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
        }

        renderTables(mergedData);
        createTabs(Object.keys(mergedData));
        createFieldSelector();

        $("#loading-indicator").fadeOut(); // Hide loading indicator
    } catch (err) {
        console.error("Error fetching metadata:", err);
        $("#loading-indicator").fadeOut(); // Hide loading indicator on error
    }
}


// Render tables with metadata
function renderTables(data) {
    $("#table-tabs").empty();
    for (var type in data) {
        var objects = data[type];
        var $table = $("<table class=\"highlight striped\">").append(
            $("<thead>").append(
                `<tr>
                    <th><label><input type="checkbox" onclick="selectAll('${type}', this)"/><span></span></label></th>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Short Name</th>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Actions</th>
                    <th>Status</th>
                </tr>`
            ),
            $("<tbody>", { id: `${type}-body` })
        );

        objects.forEach(function (obj) {
            var name = obj.name ? quoteString(highlightSpaces(obj.name)) : "";
            var shortName = obj.shortName ? quoteString(highlightSpaces(obj.shortName)) : "";
            var code = obj.code ? quoteString(highlightSpaces(obj.code)) : "";
            var description = obj.description ? quoteString(highlightSpaces(obj.description)) : "";

            var row = $(`<tr data-id="${obj.id}" data-type="${type}">`).append(
                `<td><label><input type="checkbox" class="row-checkbox" onclick="updateFixButton('${type}')"/><span></span></label></td>
                <td>${obj.id}</td>
                <td>${name}</td>
                <td>${shortName}</td>
                <td>${code}</td>
                <td>${description}</td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-small waves-effect waves-light blue check-button" onclick="checkConflicts('${type}', '${obj.id}')">Check</button>
                        <button class="btn-small waves-effect waves-light green fix-button" onclick="fixObject('${type}', '${obj.id}')" disabled>Fix</button>
                    </div>
                </td>
                <td class="status-cell"></td>`
            );
            $table.find("tbody").append(row);
        });

        var $container = $("<div>", { class: "table-container", id: `${type}-container` }).append(
            `<h5>${type.charAt(0).toUpperCase() + type.slice(1)}</h5>`,
            $table,
            `<div style="padding-top: 12px"; class="button-group">
                <button class="btn-large waves-effect waves-light yellow darken-2" onclick="checkAll('${type}')">Check Selected</button>
                <button class="btn-large waves-effect waves-light green" id="fix-all-${type}" class="fix-button" onclick="fixAll('${type}')" disabled>Fix Selected</button>
            </div>`
        );

        $("#table-tabs").append($container);
    }
    M.AutoInit(); // Initialize all Materialize elements
}


// Create tabs for different metadata types
function createTabs(types) {
    var $tabs = $("<ul class=\"tabs\">");
    types.forEach(function (type) {
        var $tab = $(`<li class="tab col s3"><a href="#${type}-container">${type.charAt(0).toUpperCase() + type.slice(1)}</a></li>`);
        $tabs.append($tab);
    });
    $("#table-tabs").before($tabs);
    setTimeout(() => M.Tabs.init($(".tabs")), 100); // Allow elements to be added before initialization
}

function getFieldValuesFromRow(row) {
    const fieldValues = {};
    
    const id = row.data("id");
    const type = row.data("type");
    const objectData = mergedData[type]?.find(obj => obj.id === id);
    
    if (!objectData) {
        return fieldValues;
    }
    
    if (selectedFields.name && objectData.name) {
        fieldValues.name = cleanString(objectData.name);
    }
    if (selectedFields.shortName && objectData.shortName) {
        fieldValues.shortName = cleanString(objectData.shortName);
    }
    if (selectedFields.code && objectData.code) {
        fieldValues.code = cleanString(objectData.code);
    }
    if (selectedFields.description && objectData.description) {
        fieldValues.description = cleanString(objectData.description);
    }
    
    return fieldValues;
}


// Check for conflicts in metadata
async function checkConflicts(type, id) {
    var row = $(`tr[data-id='${id}']`);
    var endpoint = type;
    var conflictsSummary = [];

    var fieldValues = getFieldValuesFromRow(row);

    var requests = [];
    var conflicts = {};

    Object.keys(fieldValues).forEach(function(field) {
        var value = fieldValues[field];
        if (value) {
            var encodedValue = encodeURIComponent(value);
            requests.push(
                d2Get(`/api/${endpoint}.json?filter=${field}:eq:${encodedValue}&filter=id:!eq:${id}&fields=id,${field}`).then(data => {
                    if (data[endpoint] && data[endpoint].length > 0) conflicts[field] = data[endpoint];
                }).catch(err => console.error(err.message))
            );
        }
    });

    await Promise.all(requests);

    if (Object.keys(conflicts).length > 0) {
        row.find(".status-cell").text("Conflict").addClass("status-conflict").removeClass("status-ready status-error");
        row.find(".row-checkbox").prop("checked", false);
        for (var field in conflicts) {
            conflicts[field].forEach(conflict => {
                conflictsSummary.push({
                    objectName: fieldValues.name || fieldValues.shortName || id,
                    id,
                    property: field.charAt(0).toUpperCase() + field.slice(1),
                    conflictingObjectId: conflict.id
                });
            });
        }
        showConflictSummaryModal(conflictsSummary, 0, conflictsSummary.length);
    } else {
        row.find(".status-cell").text("Ready").addClass("status-ready").removeClass("status-conflict status-error");
        row.find(".fix-button").prop("disabled", false);
        row.find(".row-checkbox").prop("checked", true);
        M.toast({html: "No conflicts found!", classes: "green"});
    }

    updateFixAllButton(type);
}


// Fix metadata object
async function fixObject(type, id) {
    var row = $(`tr[data-id='${id}']`);
    var importErrors = [];
    var objectData;

    try {
        objectData = mergedData[type].find(obj => obj.id === id);
        const operations = [];
        
        if (selectedFields.name && needsCleaning(objectData.name)) {
            operations.push({ op: "add", path: "/name", value: cleanString(objectData.name) });
        }
        if (selectedFields.shortName && needsCleaning(objectData.shortName)) {
            operations.push({ op: "add", path: "/shortName", value: cleanString(objectData.shortName) });
        }
        if (selectedFields.code && needsCleaning(objectData.code)) {
            operations.push({ op: "add", path: "/code", value: cleanString(objectData.code) });
        }
        if (selectedFields.description && needsCleaning(objectData.description)) {
            operations.push({ op: "add", path: "/description", value: cleanString(objectData.description) });
        }
        
        if (operations.length > 0) {
            await d2Patch(`/api/${type}/${id}`, operations);
        }

        if (selectedFields.name && objectData.name) {
            objectData.name = cleanString(objectData.name);
        }
        if (selectedFields.shortName && objectData.shortName) {
            objectData.shortName = cleanString(objectData.shortName);
        }
        if (selectedFields.code && objectData.code) {
            objectData.code = cleanString(objectData.code);
        }
        if (selectedFields.description && objectData.description) {
            objectData.description = cleanString(objectData.description);
        }

        var hasWhitespaceIssues = needsCleaning(objectData.name) || 
                                 needsCleaning(objectData.shortName) || 
                                 needsCleaning(objectData.code) || 
                                 needsCleaning(objectData.description);

        if (!hasWhitespaceIssues) {
            row.remove();
        } else {
            updateRowDisplay(row, objectData);
            row.find(".status-cell").text("Partially Fixed").addClass("status-ready").removeClass("status-conflict status-error");
            row.find(".fix-button").prop("disabled", true);
            row.find(".row-checkbox").prop("checked", false);
        }

        updateFixAllButton(type);
        checkRemainingRows(type);

        M.toast({ html: "Object fixed successfully!", classes: "green" });

    } catch (err) {
        row.find(".status-cell").text("Error").addClass("status-error").removeClass("status-ready status-conflict");
        row.find(".fix-button").prop("disabled", true);
        row.find(".row-checkbox").prop("checked", false);
        importErrors.push({ name: objectData.name, id, message: err.message });
        console.error(err);
        showImportResultsModal(`Update of ${objectData.name} failed.`, importErrors);
    }
}

// Show conflict summary modal
function showConflictSummaryModal(conflictsSummary, noConflictCount, conflictCount) {
    var $modal = $("#conflict-summary-modal");
    var $tableBody = $("#conflict-summary-table tbody");
    var $summaryLine = $("#conflict-summary-table-summary");
    var $description = $("#conflict-summary-table-description");
    var $table = $("#conflict-summary-table");

    $tableBody.empty(); // Clear the table body

    if (conflictsSummary.length > 0) {
        conflictsSummary.forEach(function (conflict) {
            var row = `<tr>
                    <td>${conflict.objectName}</td>
                    <td>${conflict.id}</td>
                    <td>${conflict.property}</td>
                    <td>${conflict.conflictingObjectId}</td>
                </tr>`;
            $tableBody.append(row);
        });
        $description.show();
        $table.show();
        $summaryLine.text(`${noConflictCount} rows did not have any conflicts, ${conflictCount} rows had one or more conflicts.`);
    } else {
        $description.hide();
        $table.hide();
        $summaryLine.text(`${noConflictCount} rows did not have any conflicts.`);
    }

    console.log($modal);
    var instance = M.Modal.getInstance($modal[0]);
    instance.open();

    // Scroll to top of the page
    document.getElementById("conflict-summary-modal").scrollIntoView();
}


// Show import results modal
function showImportResultsModal(importResults, importErrors = []) {
    var $modal = $("#import-results-modal");
    var $importResultsSummary = $("#import-results-summary");
    var $errorsTableBody = $("#import-errors-table tbody");

    $importResultsSummary.text(importResults);
    $errorsTableBody.empty();

    if (importErrors.length > 0) {
        importErrors.forEach(function (error) {
            var row = `<tr>
                    <td>${error.name}</td>
                    <td>${error.id}</td>
                    <td>${error.message}</td>
                </tr>`;
            $errorsTableBody.append(row);
        });
        $("#import-errors-table").show();
    } else {
        $("#import-errors-table").hide();
    }

    console.log($modal);
    var instance = M.Modal.getInstance($modal[0]);
    instance.open();

    // Scroll to top of the page
    document.getElementById("import-results-modal").scrollIntoView();
}


// Check all selected rows for conflicts
function checkAll(type) {
    var $selectedRows = $(`#${type}-body tr`).filter(function () {
        return $(this).find(".row-checkbox").is(":checked");
    });

    var totalChecked = $selectedRows.length;
    var conflictsSummary = [];
    var batchSize = 20; // Set the batch size
    var batches = [];

    // Split requests into batches
    for (var i = 0; i < $selectedRows.length; i += batchSize) {
        batches.push($selectedRows.slice(i, i + batchSize));
    }

    function processBatch(batch) {
        var batchPromises = [];
        batch.each(function () {
            var id = $(this).data("id");
            batchPromises.push(checkConflictsSummary(type, id, conflictsSummary, $selectedRows));
        });
        return $.when(...batchPromises);
    }

    // Process batches sequentially
    (function processNextBatch() {
        if (batches.length === 0) {
            // All batches processed
            var uniqueConflictIds = [...new Set(conflictsSummary.map(conflict => conflict.id))];
            var noConflictCount = totalChecked - uniqueConflictIds.length;
            showConflictSummaryModal(conflictsSummary, noConflictCount, uniqueConflictIds.length);
            return;
        }
        var batch = batches.shift();
        processBatch(batch).then(processNextBatch);
    })();
}


// Check conflicts summary for a batch of rows
async function checkConflictsSummary(type, id, conflictsSummary, $selectedRows) {
    var row = $(`tr[data-id='${id}']`);
    var endpoint = type;

    var fieldValues = getFieldValuesFromRow(row);

    var requests = [];
    var conflicts = { id, objectName: fieldValues.name || fieldValues.shortName || id };

    Object.keys(fieldValues).forEach(function(field) {
        var value = fieldValues[field];
        if (value && type !== "organisationUnits") {
            var encodedValue = encodeURIComponent(value);
            requests.push(
                d2Get(`/api/${endpoint}.json?filter=${field}:eq:${encodedValue}&filter=id:!eq:${id}&fields=id,${field}`).then(data => {
                    if (data[endpoint] && data[endpoint].length > 0) {
                        conflicts[field] = data[endpoint].map(item => ({ 
                            conflictingObjectId: item.id, 
                            property: field.charAt(0).toUpperCase() + field.slice(1)
                        }));
                    }
                }).catch(err => console.error(err.message))
            );
        }
    });

    $selectedRows.each(function () {
        if ($(this).data("id") !== id) {
            var otherFieldValues = getFieldValuesFromRow($(this));
            Object.keys(fieldValues).forEach(function(field) {
                if (fieldValues[field] && otherFieldValues[field] && fieldValues[field] === otherFieldValues[field]) {
                    if (type !== "organisationUnits" || field === "code") {
                        conflicts[field] = conflicts[field] || [];
                        conflicts[field].push({ 
                            property: field.charAt(0).toUpperCase() + field.slice(1), 
                            conflictingObjectId: $(this).data("id") 
                        });
                    }
                }
            });
        }
    });

    await Promise.all(requests);

    if (Object.keys(conflicts).length > 2) { // More than just `id` and `objectName`
        row.find(".status-cell").text("Conflict").addClass("status-conflict").removeClass("status-ready status-error");
        row.find(".row-checkbox").prop("checked", false);
        for (var field in conflicts) {
            if (field !== "id" && field !== "objectName") {
                conflicts[field].forEach(conflict => {
                    conflictsSummary.push({
                        objectName: conflicts.objectName,
                        id: conflicts.id,
                        property: conflict.property,
                        conflictingObjectId: conflict.conflictingObjectId
                    });
                });
            }
        }
    } else {
        row.find(".status-cell").text("Ready").addClass("status-ready").removeClass("status-conflict status-error");
        row.find(".fix-button").prop("disabled", false);
    }
    updateFixAllButton(type);
}


// Update fix button state
function updateFixButton(type) {
    var $rows = $(`#${type}-body tr`);
    $rows.each(function () {
        var $row = $(this);
        if ($row.find(".row-checkbox").is(":checked") && $row.find(".status-cell").text() === "Ready") {
            $row.find(".fix-button").prop("disabled", false);
        } else {
            $row.find(".fix-button").prop("disabled", true);
        }
    });
    updateFixAllButton(type);
}


// Update fix all button state
function updateFixAllButton(type) {
    var allReady = true;
    var $rows = $(`#${type}-body tr`);
    $rows.each(function () {
        var $row = $(this);
        if ($row.find(".row-checkbox").is(":checked") && $row.find(".status-cell").text() !== "Ready") {
            allReady = false;
            return false;
        }
    });
    $(`#fix-all-${type}`).prop("disabled", !allReady);
}


// Fix all selected rows
function fixAll(type) {
    var $rows = $(`#${type}-body tr:has(.row-checkbox:checked)`);
    var totalFixed = 0;
    var totalFailed = 0;
    var importErrors = [];

    var requests = $rows.map(function () {
        if ($(this).find(".row-checkbox").is(":checked") && $(this).find(".status-cell").text() === "Ready") {
            var id = $(this).data("id");
            var name = $(this).find("td:nth-child(3)").text();
            return fixObjectSummary(type, id, name).then(function (success) {
                if (success) {
                    totalFixed++;
                } else {
                    totalFailed++;
                    importErrors.push({ name, id, message: "Failed to update" });
                }
            });
        }
    }).get();

    $.when(...requests).then(() => {
        var importResults = `${totalFixed} objects fixed, ${totalFailed} objects failed.`;
        showImportResultsModal(importResults, importErrors);
        checkRemainingRows(type);
    });
}

function updateRowDisplay(row, objectData) {
    var name = objectData.name ? quoteString(highlightSpaces(objectData.name)) : "";
    var shortName = objectData.shortName ? quoteString(highlightSpaces(objectData.shortName)) : "";
    var code = objectData.code ? quoteString(highlightSpaces(objectData.code)) : "";
    var description = objectData.description ? quoteString(highlightSpaces(objectData.description)) : "";

    row.find("td:nth-child(3)").html(name);
    row.find("td:nth-child(4)").html(shortName);
    row.find("td:nth-child(5)").html(code);
    row.find("td:nth-child(6)").html(description);
}


// Check remaining rows and update UI
function checkRemainingRows(type) {
    var $rows = $(`#${type}-body tr`);
    if ($rows.length === 0) {
        var $tabButton = $(`.tabs a[href='#${type}-container']`).parent();
        var currentIndex = $tabButton.index();
        $tabButton.remove();
        $(`#${type}-container`).remove();

        var $tabs = $(".tabs .tab a");
        if ($tabs.length > 0) {
            var nextTab = $tabs.eq(Math.min(currentIndex, $tabs.length - 1));
            nextTab.addClass("active").trigger("click");
            var nextTabId = nextTab.attr("href").substring(1);
            $(`#${nextTabId}`).addClass("active");
            M.Tabs.getInstance($(".tabs")).select(nextTabId); // Ensure the content is rendered
        } else {
            $("#table-tabs").html("<div class=\"success-message\">Success!</div>");
        }
    }
}

// Fix metadata object summary
async function fixObjectSummary(type, id) {
    var row = $(`tr[data-id='${id}']`);
    var objectData;
    try {
        objectData = mergedData[type].find(item => item.id === id);

        const operations = [];
        
        if (selectedFields.name && needsCleaning(objectData.name)) {
            operations.push({ op: "add", path: "/name", value: cleanString(objectData.name) });
        }
        if (selectedFields.shortName && needsCleaning(objectData.shortName)) {
            operations.push({ op: "add", path: "/shortName", value: cleanString(objectData.shortName) });
        }
        if (selectedFields.code && needsCleaning(objectData.code)) {
            operations.push({ op: "add", path: "/code", value: cleanString(objectData.code) });
        }
        if (selectedFields.description && needsCleaning(objectData.description)) {
            operations.push({ op: "add", path: "/description", value: cleanString(objectData.description) });
        }

        if (operations.length > 0) {
            await d2Patch(`/api/${type}/${id}`, operations);
        }

        if (selectedFields.name && objectData.name) {
            objectData.name = cleanString(objectData.name);
        }
        if (selectedFields.shortName && objectData.shortName) {
            objectData.shortName = cleanString(objectData.shortName);
        }
        if (selectedFields.code && objectData.code) {
            objectData.code = cleanString(objectData.code);
        }
        if (selectedFields.description && objectData.description) {
            objectData.description = cleanString(objectData.description);
        }

        var hasWhitespaceIssues = needsCleaning(objectData.name) || 
                                 needsCleaning(objectData.shortName) || 
                                 needsCleaning(objectData.code) || 
                                 needsCleaning(objectData.description);

        if (!hasWhitespaceIssues) {
            row.remove();
        } else {
            updateRowDisplay(row, objectData);
            row.find(".status-cell").text("Partially Fixed").addClass("status-ready").removeClass("status-conflict status-error");
        }

        return true;

    } catch (err) {
        console.error("Update failed", err);
        row.find(".status-cell").text("Error").addClass("status-error").removeClass("status-ready status-conflict");
        row.find(".fix-button").prop("disabled", true);
        row.find(".row-checkbox").prop("checked", false);
        showImportResultsModal("Some objects failed to update.", [{ name: objectData.name, id, message: err.message }]);
        return false;
    }
}

// Utility function to clean strings by removing leading, trailing, and multiple spaces
function cleanString(str) {
    if (typeof str !== "string") {
        return str;
    }
    // Replace multiple spaces with a single space and trim leading/trailing spaces
    return str.replace(/\s\s+/g, " ").trim();
}

// Function to check if a string needs cleaning: has leading/trailing spaces or multiple consecutive spaces
function needsCleaning(str) {
    // Return false if the string is null, undefined, or not a string
    if (str === null || typeof str !== "string") {
        return false;
    }

    // Check if the string is non-empty and contains problematic spaces
    return /\s\s+/.test(str) || str.trim() !== str;
}


// Select all rows in a table
function selectAll(type, checkbox) {
    var $rows = $(`#${type}-body tr`);
    $rows.find(".row-checkbox").prop("checked", checkbox.checked);
    updateFixButton(type);
}


$(function () {
    fetchAndRenderMetadata();

    // Event delegation for dynamically added elements
    $(document).on("click", ".modal-close", function () {
        var modal = $(this).closest(".modal")[0];
        console.log(modal);
        if (modal) {
            var instance = M.Modal.getInstance(modal);
            if (instance) {
                instance.close();
            }
        }
    });

    // Initialize modals
    M.Modal.init(document.querySelectorAll(".modal"), { dismissible: true });
    M.Tabs.init(document.querySelectorAll(".tabs"));
    M.AutoInit(); // Initialize all Materialize elements
});


// Expose only necessary functions to the global scope
window.fetchAndRenderMetadata = fetchAndRenderMetadata;
window.checkConflicts = checkConflicts;
window.fixObject = fixObject;
window.updateFixButton = updateFixButton;
window.checkAll = checkAll;
window.fixAll = fixAll;
window.selectAll = selectAll;
window.updateFieldSelection = updateFieldSelection;
