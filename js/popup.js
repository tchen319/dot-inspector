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
const PIXEL_KEYS = ['a', '.yp', 'et', 'ec', 'ea', 'el', 'ev', 'gv'];
const PIXEL_INFO = ['project ID', 'pixel ID', 'event type', 'event category', 'event action', 'event label', 'event value', 'gemini value'];

/**
 */
function loadPixels() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const tab = tabs[0];
        console.log('got tab: ' + tab.id);

        chrome.runtime.sendMessage({action: 'pixels', tabId: tab.id}, function (pixelCollection) {
            if (pixelCollection) {
                const pixelDetails = pixelCollection.pixels;
                const container = document.querySelector('#container');
                const template = document.querySelector('#pixel-content-template').content;

                if (pixelDetails) {
                    const pixelGroup = new Set();

                    for (let i = 0; i < pixelDetails.length; i++) {
                        pixelGroup.add(pixelDetails[i].pixel_id);
                    }

                    for (const pixelId of pixelGroup) {
                        /**
                         * Display a pixel ID
                         */
                        let contentDiv = template.querySelector('#content');
                        const pixelLabel = contentDiv.getElementsByClassName('pixel-caption')[0];
                        const valueSpan = pixelLabel.getElementsByTagName('span')[0];

                        valueSpan.textContent = (!pixelId ? 'Missing' : pixelId);
                        contentDiv = document.importNode(contentDiv, true);

                        for (let i = 0; i < pixelDetails.length; i++) {
                            if (pixelDetails[i].pixel_id === pixelId) {
                                createPixelDiv(contentDiv, pixelDetails[i]);
                            }
                        }

                        // separate from a previous pixel group
                        container.appendChild(contentDiv);
                    }
                } else {
                    const baseUrl = tab.url.replace(/(http[s]?:\/\/[^\/?]*).*$/, '$1');
                    let noContentDiv = template.querySelector('#no-content');

                    noContentDiv.innerHTML = 'No pixels found on <u>' + baseUrl + '</u>';
                    noContentDiv = document.importNode(noContentDiv, true);
                    container.appendChild(noContentDiv);
                }
            }
        });
    });
}

/**
 * Create a new section showing both a pixel summary info and detail info.
 * @param pixel is a 'PixelDetail' object defined in background.js
 */
function createPixelDiv(contentDiv, pixel) {
    const pixelList = contentDiv.getElementsByClassName('pixel-list')[0];
    const toggleDiv = pixelList.getElementsByClassName('pixel-detail-toggle')[0];
    const detailDiv = pixelList.getElementsByClassName('pixel-detail')[0];

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
    const _event_action = !pixel.event_action ? 'Unknown Event Action' : pixel.event_action;
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
    createDetailEntryDiv(detailDiv, [`URL (${pixel.type})`], urlBeautify(pixel.url), false, true);
    createDetailEntryDiv(detailDiv, ['Load time'], pixel.load_time);

    for (let i = 0; i < PIXEL_KEYS.length; i++) {
        const key = PIXEL_KEYS[i];
        const info = PIXEL_INFO[i];
        let value = pixel.params[key];

        createDetailEntryDiv(detailDiv, [key, info], value);
    }

    // Insert it into DOM, and then make it visible by removing the invisible style
    contentDiv.appendChild(pixelList);
}

/**
 * Convert HTML entities to characters, and then insert <wbr> tag to break down a long line
 */
function urlBeautify(url) {
    let i = url.indexOf('?') + 1;
    let t = decodeURIComponent(url.substring(i)).replace(/([&,\/?])/g, '<wbr>$1');

    return url.substring(0, i) + decodeURIComponent(t);
}

/**
 * Create a single cell of pixel summary info
 * @param parentDiv - where a new cell is appended
 * @param labels
 * @param value The actual value shown next to the label
 * @param delimiter separates a label from its value
 * @param isShowHide indicates whether the display of the value can be shown and hidden
 * @param isOptional indicates whether the value is optional
 */
function createDetailEntryDiv(parentDiv, labels, value, isOptional = false, isShowHide = false) {
    let entryHTMLTemplateId = '#pe-template';

    if (!value) {
        entryHTMLTemplateId = '#pe-template-missing';
    } else if (isShowHide) {
        entryHTMLTemplateId = '#pe-template-show';
    }

    const content = document.querySelector(entryHTMLTemplateId).content;
    content.querySelector("label").textContent = `${labels[0]}:`;

    if (value) {
        const valueDiv = content.querySelector(".pe-value");

        if (isShowHide) {
            valueDiv.textContent = 'Show';
            const longValueDiv = content.querySelector(".pe-longtext");
            longValueDiv.hidden = true;
            longValueDiv.innerHTML = value;
        } else {
            valueDiv.textContent = value;
        }
    }

    const detailEntryDiv = document.importNode(content, true);
    const valueDiv = detailEntryDiv.querySelector(".pe-value");

    if (labels.length == 2) {
        valueDiv.textContent += ` (${labels[1]})`;
        console.log('new label: ' + valueDiv.textContent);
    }
    if (value && isShowHide) {
        const longValueDiv = detailEntryDiv.querySelector(".pe-longtext");

        valueDiv.addEventListener('click', () => {
            longValueDiv.hidden = !longValueDiv.hidden;
            valueDiv.textContent = (longValueDiv.hidden ? 'Show' : 'Hide');
        }, {
            useCapture: true
        });
    }

    parentDiv.appendChild(detailEntryDiv);
}

document.addEventListener('DOMContentLoaded', () => {
    loadPixels();
    document.body.style.display = 'block';
});
