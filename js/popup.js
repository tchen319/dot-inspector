'use strict';

/**
 * @author tong on 2/10/2018
 */
const PARAM_PROJECT_ID = 0x1;
const PARAM_PIXEL_ID = 0x2;
const PARAM_PRODUCT_ID = 0x4;
const PARAM_EVENT_ACTION = 0x8;
const PARAM_EVENT_TYPE = 0x10;
const ERROR_MASK = PARAM_PROJECT_ID | PARAM_PIXEL_ID;
const WARNING_MASK = PARAM_PRODUCT_ID | PARAM_EVENT_ACTION | PARAM_EVENT_TYPE;

let pixelListTemplateDiv;
let pixelLabelTemplateDiv;
let contentDiv;

/**
 */
function loadPixels() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const tab = tabs[0];
        console.log('got tab: ' + tab.id);

        chrome.runtime.sendMessage({action: 'pixels', tabId: tab.id}, function (pixelCollection) {
            if (pixelCollection) {
                const pixelDetails = pixelCollection.pixels;
                const noContentDiv = document.getElementById('no-content');
                const contentDiv = document.getElementById('content');

                if (pixelDetails) {
                    const pixelGroup = new Set();

                    for (let i = 0; i < pixelDetails.length; i++) {
                        pixelGroup.add(pixelDetails[i].pixel_id);
                    }

                    for (const pixelId of pixelGroup) {
                        /**
                         * Display a pixel ID
                         */
                        const pixelLabel = pixelLabelTemplateDiv.cloneNode(false);
                        const _pixel_id = (!pixelId ? 'Missing' : pixelId);

                        pixelLabel.innerHTML = `<label>Pixel ID:</label><span>${_pixel_id}</span>`;
                        pixelLabel.removeAttribute('data-template');
                        contentDiv.appendChild(pixelLabel);

                        for (let i = 0; i < pixelDetails.length; i++) {
                            if (pixelDetails[i].pixel_id === pixelId) {
                                createPixelDiv(pixelDetails[i]);
                            }
                        }

                        // separate from a previous pixel group
                        const separatorDiv = document.createElement('div');
                        separatorDiv.classList.add('pixel-group-divider');
                        contentDiv.appendChild(separatorDiv);
                    }

                    noContentDiv.style.display = 'none';
                    contentDiv.style.display = 'inherit';

                } else {
                    const baseUrl = tab.url.replace(/(http[s]?:\/\/[^\/?]*).*$/, '$1');
                    noContentDiv.innerHTML = 'No pixels found on <u>' + baseUrl + '</u>';
                    noContentDiv.style.display = 'inherit';
                    contentDiv.style.display = 'none';
                }
            }
        });
    });
}

/**
 * Create a new section showing both a pixel summary info and detail info.
 * @param pixel is a 'PixelDetail' object defined in background.js
 */
function createPixelDiv(pixel) {
    if (!pixelListTemplateDiv) {
        console.log('missing a pixel template');
        return;
    }

    const pixelList = pixelListTemplateDiv.cloneNode(true);
    const toggleDiv = pixelList.getElementsByClassName('pixel-detail-toggle')[0];
    const detailDiv = pixelList.lastElementChild;

    /**
     * Add a toggle icon and then a status icon
     */
    const statusIcon = toggleDiv.getElementsByClassName('fa-exclamation-circle')[0];

    if (pixel.event_mask & ERROR_MASK) {
        statusIcon.style.color = '#f44253';
    } else if (pixel.event_mask & WARNING_MASK) {
        statusIcon.style.color = '#ff9900';
    } else {
        statusIcon.style.color = '#2ecc71';
    }

    /**
     * Add an event action - default 'Page View' is assumed
     */
    const eventActionDiv = toggleDiv.lastElementChild;
    const _event_action = !pixel.event_action ? 'Page View' : pixel.event_action;
    eventActionDiv.innerHTML = `${_event_action}`;

    // Add a click event listener
    detailDiv.hidden = true;
    toggleDiv.addEventListener('click', () => {
        detailDiv.hidden = !detailDiv.hidden;

        const toggleIconDiv = toggleDiv.firstElementChild;
        const toggleFont = toggleIconDiv.firstElementChild;
        const classList = toggleFont.classList;

        if (detailDiv.hidden) {
            classList.add('fa-angle-double-right');
            classList.remove('fa-angle-double-down');
        } else {
            classList.remove('fa-angle-double-right');
            classList.add('fa-angle-double-down');
        }
    }, {
        useCapture: true
    });

    /**
     * Add an event details
     */
    createDetailEntryDiv(detailDiv, 'Event Type', pixel.event_type);
    createDetailEntryDiv(detailDiv, 'Product ID', pixel.product_id);
    createDetailEntryDiv(detailDiv, 'Gemini ID', pixel.project_id);

    // Insert it into DOM, and then make it visible by removing the invisible style
    contentDiv.appendChild(pixelList);
    pixelList.removeAttribute('data-template');
}

/**
 * Create a single cell of pixel summary info
 * @param parentDiv - where a new cell is appended
 * @param label
 * @param value The actual value shown next to the label
 */
function createDetailEntryDiv(parentDiv, label, value) {
    const detailEntryDiv = document.createElement('div');

    if (value) {
        detailEntryDiv.innerHTML = `<label>${label}:</label><span>${value}</span>`;
    } else {
        detailEntryDiv.innerHTML = `<label>${label}:</label><span style="color:#f44253">&lt;missing&gt;</span>`;
    }
    parentDiv.appendChild(detailEntryDiv);
}

document.addEventListener('DOMContentLoaded', () => {
    contentDiv = document.getElementById('content');
    pixelLabelTemplateDiv = document.querySelector('div[data-template="label"]');
    pixelListTemplateDiv = document.querySelector('div[data-template="pixel"]');

    loadPixels();
});
