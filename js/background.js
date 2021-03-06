'use strict';

/**
 * @author tong on 2/10/2018
 */
const PARAM_PROJECT_ID = 0x1;
const PARAM_PIXEL_ID = 0x2;
const PARAM_PRODUCT_ID = 0x4;
const PARAM_EVENT_ACTION = 0x8;
const PARAM_EVENT_TYPE = 0x10;

const HTTP_REQUEST_ERROR = 0x1000;
const ERROR_MASK = PARAM_PROJECT_ID | PARAM_PIXEL_ID | PARAM_PRODUCT_ID | PARAM_EVENT_ACTION | HTTP_REQUEST_ERROR;
const WARNING_MASK = 0;

/**
 * current tab's pixels
 */
let tabPixelCollection = {};
let activeTab;

/**
 * Parse a raw pixel URL that is intercepted during HTTP Request. For a javascript based pixel, additional parameters are inspected
 * @param requestDetail - https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/webRequest/onBeforeRequest#details
 * @return PixelDetail
 */
function parsePixel(requestDetail) {
    const pixel = parseMinimumPixel(requestDetail);

    if (requestDetail.type === 'script') {
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
 * @param requestDetail - https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/webRequest/onBeforeRequest#details
 * @return PixelDetail
 */
function parseMinimumPixel(requestDetail) {
    const url = requestDetail.url;
    const param_start = url.indexOf('?');
    const params = (param_start > 0 ? new URLSearchParams(url.substring(param_start + 1)) : null);
    const pixel = new PixelDetail(requestDetail, params);

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
    if (!pixelCollection) {
        return;
    }

    const pixels = pixelCollection.pixels;
    let text = '';

    // Update the icon color
    if (pixels && pixels.length > 0) {
        let color = '#2ecc71';
        text = '' + pixels.length;

        if (pixelCollection.error_count > 0) {
            color = '#f44253';
        } else if (pixelCollection.warning_count > 0) {
            color = '#ff9900';
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
 * An utility function for clearing all pixels in a collection. Since a tab's onUpdated event may be fired after
 * some or all of it pixel requests are sent out first, we don't want to clear the pixels we just collected. So
 * we put a damper to avoid such race condition
 */
PixelCollection.clear = function (tabId, damper = 5000) {
    const memberPixels = tabPixelCollection[tabId];
    if (memberPixels) {
        const pixels = memberPixels.pixels;
        let changed = false;

        if (pixels) {
            let i = 0;
            while (i < pixels.length) {
                if (pixels[i].now + damper <= Date.now()) {
                    pixels.splice(i, 1);
                    changed = true;
                } else {
                    i++;
                }
            }
        }

        if (changed) {
            updateBadge(memberPixels);
        }

        // clean up a pixel collection only if it is blank
        if (!pixels || !pixels.length) {
            delete tabPixelCollection[tabId];
        }
    }
};

/**
 * Data structure - store the result of a parsed pixel URL in an object
 * @param requestDetail - https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/webRequest/onBeforeRequest#details
 * @param requestParams - a pixel's query parameters
 */
function PixelDetail(requestDetail, requestParams) {
    this.id = requestDetail.requestId;
    this.type = requestDetail.type;
    this.url = requestDetail.url;
    this.initiator = requestDetail.originUrl;
    this.load_time = -requestDetail.timeStamp; // negate the value to indicate it is incomplete
    this.params = {};
    this.event_mask = 0xff;
    this.now = Date.now();

    if (requestParams) {
        this.project_id = requestParams.get('a'); // it should always be 10000 for Yahoo Gemini
        this.pixel_id = requestParams.get('.yp'); // a Gemini pixel id, which is unique
        this.event_action = requestParams.get('ea');
        this.event_type = requestParams.get('et');
        this.product_id = requestParams.get('product_id');

        for (const p of requestParams) {
            this.params[p[0]] = p[1];
        }
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
        PixelCollection.clear(tabId);
    }
});

chrome.tabs.onReplaced.addListener(function (addedTabId, removedTabId) {
    console.log('replaced with tab: ' + addedTabId + ', and removed tab: ' + removedTabId);
});

chrome.tabs.onRemoved.addListener(function (tabId, info) {
    console.log('removed tab: ' + tabId);
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
    updateBadge(tabPixelCollection[activeInfo.tabId]);
});

/**
 * Listen for <script> and <img> loading. The scope of url is defined in manifect.json
 */
chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
        PixelCollection.add(details, parsePixel(details));
        // console.log('details: ' + JSON.stringify(tabPixelCollection));
        return {cancel: false};
    },
    {
        urls: ["*://sp.analytics.yahoo.com/*"],
        types: ["script", "image"]
    }
);

/**
 * Listen for <script> and <img> loading. The scope of url is defined in manifect.json
 */
chrome.webRequest.onCompleted.addListener(
    function (details) {
        const memberPixels = tabPixelCollection[details.tabId];
        if (memberPixels && memberPixels.pixels) {
            for (const p of memberPixels.pixels) {
                if (p.id === details.requestId) {
                    p.load_time = Date.now() + p.load_time;
                    p.load_time = Number.parseFloat(p.load_time).toFixed(2);
                    break;
                }
            }
        }

        return {cancel: false};
    },
    {
        urls: ["*://sp.analytics.yahoo.com/*"],
        types: ["script", "image"]
    }
);

/**
 * Listen for <script> and <img> loading. The scope of url is defined in manifect.json
 */
chrome.webRequest.onBeforeRedirect.addListener(
    function (details) {
        const memberPixels = tabPixelCollection[details.tabId];
        if (memberPixels && memberPixels.pixels) {
            for (const p of memberPixels.pixels) {
                if (p.id === details.requestId) {
                    p.load_time = Date.now() + p.load_time;
                    p.load_time = Number.parseFloat(p.load_time).toFixed(2);
                    break;
                }
            }
        }

        return {cancel: false};
    },
    {
        urls: ["*://sp.analytics.yahoo.com/*"],
        types: ["script", "image"]
    }
);

chrome.webRequest.onErrorOccurred.addListener(
    function (details) {
        const memberPixels = tabPixelCollection[details.tabId];
        if (memberPixels && memberPixels.pixels) {
            for (const p of memberPixels.pixels) {
                if (p.id === details.requestId) {
                    p.load_time = (details.error ? p.load_time : 'Error');
                    p.event_mask |= HTTP_REQUEST_ERROR;
                    break;
                }
            }
        }

        return {cancel: false};
    },
    {
        urls: ["*://sp.analytics.yahoo.com/*"],
        types: ["script", "image"]
    }
);

/**
 * Remember a currently active tab
 */
chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
    activeTab = (tabs && tabs.length > 0) ? tabs[0] : null;
});