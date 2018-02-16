'use strict';

/**
 * @author tong on 2/10/2018
 *
 * The background page is asking us to find all Yahoo product pixels on a current page.
 * Note, we're not inspecting a pixel in an embedded frame
 */
if (window == top) {
    chrome.extension.onMessage.addListener(function (msg, sender, sendResponse) {
        sendResponse(mockedFindPixels());

        console.log('received req: ' + JSON.stringify(msg));
        console.log('received sender: ' + JSON.stringify(sender));
    });
}

/**
 * Scoure javascripts for Yahoo pixels
 */
const findPixels = function() {
    const script_src = [];
    const image_src = [];

    /**
     * A good example:
     * https://sp.analytics.yahoo.com/sp.pl?a=10000&jsonp=YAHOO.ywa.I13N.handleJSONResponse&b=Original%20Jose%20Bose%20T-shirt%20%E2%80%93%20josebose&.yp=10039241&
     *      f=https%3A%2F%2Fjosebose.myshopify.com%2Fcollections%2Ffrontpage%2Fproducts%2Foriginal-jose-bose-t-shirt&
     *      e=https%3A%2F%2Fjosebose.myshopify.com%2F&enc=UTF-8&et=custom&ea=ViewProduct&product_id=10322601481
     *
     * A bad example:
     * https://sp.analytics.yahoo.com/sp.pl?a=10000&jsonp=YAHOO.ywa.I13N.handleJSONResponse&d=Fri%2C%2009%20Feb%202018%2003%3A23%3A31%20GMT&n=8&
     *      b=JCPenney%20Coupon%20%26%20Promo%20Codes&.yp=25984&
     *      f=https%3A%2F%2Fwww.jcpenney.com%2Fjsp%2Fbrowse%2Fmarketing%2Fpromotion.jsp%3FpageId%3Dpg40048300007%26cm_re%3DHP-DT-_-ZA0121-_-53deals&enc=UTF-8
     */
    for (const s of document.scripts) {
        if (s.src.includes('sp.analytics.yahoo.com')) {
            script_src.push(s.src);
        }
        console.log('next script src: ' + s.src);
        console.log('script text: ' + s.text);
        console.log('=================');
    }

    /**
     * A good example:
     * <img src="https://sp.analytics.yahoo.com/spp.pl?a=10000&.yp=10038216"/>
     */
    for (const i of document.images) {
        if (i.src.includes('sp.analytics.yahoo.com')) {
            image_src.push(i.src);
        }
    }

    const pixels = {
        js_src: script_src,
        img_src: image_src
    }

    console.log('next script src: ' + JSON.stringify(pixels));
    return pixels;
};

/**
 * A dummy function
 */
const mockedFindPixels = function () {
    return {
        js_src: [],
        img_src: []
    };
};