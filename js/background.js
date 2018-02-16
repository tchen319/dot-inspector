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

/**
 * current tab's pixels
 */
let tabPixelCollection = {};
let activeTab;

/**
 * Parse a raw pixel URL that is intercepted during HTTP Request. For a javascript based pixel, additional parameters are inspected
 */
function parsePixel(details) {
    const pixel = parseMinimumPixel(details.url);

    if (details.type === 'script') {
        // parse Yahoo Gemini javascript dot pixel url
        if (pixel.product_id) {
            pixel.event_mask &= ~PARAM_PRODUCT_ID;
        }
        if (pixel.event_action) {
            pixel.event_mask &= ~PARAM_EVENT_ACTION; // TODO - verify against a list of known actions
        }
        if (pixel.event_type) {
            pixel.event_mask &= ~PARAM_EVENT_TYPE;
        }
    }

    return pixel;
}

/**
 * Parse either a javascript url or an image url, and verify two basic required parameters (project id and pixel id)
 * @param url a Yahoo Gemini Pixel request URL, which could be from either a javascript or an image request
 */
function parseMinimumPixel(url) {
    const param_start = url.indexOf('?');
    const params = (param_start > 0 ? new URLSearchParams(url.substring(param_start + 1)) : null);
    const pixel = new PixelDetail(url, params, 0xff);

    if (pixel.project_id && !isNaN(pixel.project_id)) {
        pixel.event_mask &= ~PARAM_PROJECT_ID;
    }
    if (pixel.pixel_id && !isNaN(pixel.pixel_id)) {
        pixel.event_mask &= ~PARAM_PIXEL_ID;
    }
    return pixel;
}

/**
 * Data structure - a group of all parsed pixels in one Browser Tab
 */
function PixelCollection() {
    this.tab_id = null;
    this.pixels = [];
    this.error_count = 0;
    this.warning_count = 0;
    this.duplicate_count = 1;
}

/**
 * An utility function for storing a pixel in the collection
 * @param requestDetails a web request detail that is passed to our listener
 * @param pixel
 */
PixelCollection.add = function (requestDetails, pixel) {
    if (requestDetails.tabId == -1) {
        return; // this is from a popup
    }
    const memberPixels = tabPixelCollection[requestDetails.tabId] || new PixelCollection();

    tabPixelCollection[requestDetails.tabId] = memberPixels;
    memberPixels.tab_id = requestDetails.tabId;

    const pixels = memberPixels.pixels || [];
    pixels.push(pixel);
    memberPixels.pixels = pixels;

    // Check duplication of an effectiveness
    for (let i = 0; i < pixels.length - 1; i++) {
        if (pixels[i].event_mask === pixel.event_mask) {
            memberPixels.duplicate_count++;
            break;
        }
    }

    // Check the completeness of a pixel
    if (pixel.isError()) {
        memberPixels.error_count++;
    }
    if (pixel.isWarning()) {
        memberPixels.warning_count++;
    }

    updateBadge(memberPixels);
};

/**
 * Update the badge of the icon
 * @param pixelCollection
 */
function updateBadge(pixelCollection) {
    const pixels = pixelCollection.pixels;
    let text = '';

    // Update the icon color
    if (pixels && pixels.length > 0) {
        let color = '#2ecc71';
        text = '' + pixels.length;

        if (pixelCollection.error_count > 0) {
            color = '#f44253';
        } else if (pixelCollection.warning_count > 0) {
            color = '#f4d442';
        }

        chrome.browserAction.setBadgeBackgroundColor({
            color: color,
            tabId: pixelCollection.tab_id
        });
    }

    // Update the icon
    chrome.browserAction.setBadgeText({
        text: text,
        tabId: pixelCollection.tab_id
    });
}

/**
 * An utility function for clearing all pixels in a collection
 * @param requestDetails a web request detail that is passed to our listener
 */
PixelCollection.clear = function (requestDetails) {
    if (tabPixelCollection[requestDetails.tabId]) {
        delete tabPixelCollection[requestDetails.tabId];
    }
};

/**
 * Data structure - store the result of a parsed pixel URL in an object
 */
function PixelDetail(url, params, mask) {
    this.type = 'script';
    this.url = url;
    this.params = params;
    this.event_mask = mask;

    if (params) {
        this.project_id = params.get('a'); // it should always be 10000 for Yahoo Gemini
        this.pixel_id = params.get('.yp'); // a Gemini pixel id, which is unique
        this.event_action = params.get('ea');
        this.event_type = params.get('et');
        this.product_id = params.get('product_id');
    }

    this.isError = function () {
        return this.event_mask & ERROR_MASK;
    };

    this.isWarning = function () {
        return (this.event_mask & WARNING_MASK) && (this.type === 'script');
    }
}

/**
 * Listen a message from our popup.html, and responds with a collection of pixels
 */
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log('received req: ' + JSON.stringify(request));
    console.log('all pixels: ' + JSON.stringify(tabPixelCollection));

    if (request.action === 'pixels') {
        const memberPixels = tabPixelCollection[request.tabId] || [];
        sendResponse(memberPixels); // array of PixelDetail objects
    }
});

chrome.tabs.onUpdated.addListener(function (tabId, change, tab) {
    if (change.status == "complete") {
        // fetchPixels(tabId);
    }
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
    updateBadge(tabPixelCollection[activeInfo.tabId]);
});

chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
        PixelCollection.add(details, parsePixel(details));
        // console.log('details: ' + JSON.stringify(tabPixelCollection));
        return {cancel: false};
    },
    {
        urls: ["<all_urls>"],
        types: ["script", "image"]
    }
);

/**
 * Remember a currently active tab
 */
chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
    activeTab = (tabs && tabs.length > 0) ? tabs[0] : null;
    console.log('current tab: ' + JSON.stringify(activeTab));
});