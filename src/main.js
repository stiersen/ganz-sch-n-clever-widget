import { WidgetApi } from 'matrix-widget-api'
import React from "react";
import ReactDOM from "react-dom";
import App from './App';
import { parseFragment, assertParam, handleError } from "./utils"

export const CLEVER_EVENT_NAME = 'org.github.clever';
export const CLEVER_AUTH_ROOMID = "!sPOhwuPhvxpPgNufTt:matrix.org";

export const CLEVER_AUTH_PUBLIC_ROOMID = "#st-petersburg-auth:matrix.org";
export const CLEVER_AUTH_PUBLIC_LINK = "https://matrix.to/#/#st-petersburg-auth:matrix.org";

export const CLEVER_AUTH_PERMISSIONTOKEN = "permissionToken";
export const CLEVER_AUTH_CONTENT_KEY = "ICanReadThisSoIAmInTheRoom"

let widgetId;
let api;
let userId;

try {
    const qs = parseFragment();
    widgetId = assertParam(qs, 'widgetId');
    userId = assertParam(qs, 'userId');

    api = new WidgetApi(widgetId);
} catch (e) {
    handleError(e);
}
api.requestCapabilityToReceiveState("m.room.member");

api.requestCapabilityToReceiveEvent("m.room.message");
api.requestCapabilityToSendEvent("m.room.message");

api.requestCapabilityToSendState(CLEVER_EVENT_NAME);
api.requestCapabilityToReceiveState(CLEVER_EVENT_NAME);

api.requestCapabilityForRoomTimeline(CLEVER_AUTH_ROOMID);

// Add custom action handlers (if needed)
// api.on(`action:${WidgetApiToWidgetAction.UpdateVisibility}`, (ev: CustomEvent<IVisibilityActionRequest>) => {
//     ev.preventDefault(); // we're handling it, so stop the widget API from doing something.
//     console.log(ev.detail); // custom handling here
//     api.transport.reply(ev.detail, <IWidgetApiRequestEmptyData>{});
// });
// api.on("action:com.example.my_action", (ev: CustomEvent<ICustomActionRequest>) => {
//     ev.preventDefault(); // we're handling it, so stop the widget API from doing something.
//     console.log(ev.detail); // custom handling here
//     api.transport.reply(ev.detail, {custom: "reply"});
// });

// TODO
// [x] fix order of players (you are always on top)
// [x] show activated card when activating observatory
// [ ] highlight actiaved card when activating observatory
// [ ] show money from player evaluation (next to points/ money or in last turn element)
// [ ] show card on hover (bottom right if overed card is on top, top right otherwise)
// [ ] change dark theme backgorund of field
// [ ] buy upgraded from obs
// [x] disable upgrading on disabled cards
// [ ] show how often pub got activated in last turn
// [x] use content from membership event for display name and joined state.
// [ ] observatory is cancellable if you click buy on upgrade.
export function tryAuthentication() {
    console.log("try to autheticate")
    api.readStateEvents(
        CLEVER_EVENT_NAME,
        25,
        CLEVER_AUTH_PERMISSIONTOKEN,
        [CLEVER_AUTH_ROOMID],
    ).then((events) => {
        if (events.length > 0) {
            if (events[0].content[CLEVER_AUTH_CONTENT_KEY]) {
                console.log("Seems like the user is part of the #clever-auth:matrix.org room and can play")
                onAuthenticated();
            }
        }
        console.log("could not authenticate with events", events);
    });
}

function onAuthenticated() {
    let a = document.getElementById("root");
    window.app = <App widgetApi={api} userId={userId} widgetId={widgetId} />;
    ReactDOM.render(window.app, a);
}

api.on("ready", function () {
    document.getElementById("tryAuthenticationButton").onclick = tryAuthentication
    document.getElementById("roomLinkP").innerHTML = "<b>"+CLEVER_AUTH_PUBLIC_ROOMID+"</b>";
    tryAuthentication();
});

api.start();

