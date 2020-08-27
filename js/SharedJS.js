"use strict";
/*

Copyright 2010-2020 Scott Fortmann-Roe. All rights reserved.

This file may distributed and/or modified under the
terms of the Insight Maker Public License (https://InsightMaker.com/impl).

*/

var viewConfig = {
	sideBarWidth: 330,
	referenceBarWidth: 240,
	enableContextMenu: true,
	focusDiagram: true,
	allowEdits: is_editor && (!is_embed),
	saveEnabled: true,
	buttonGroups: true,
	showLogo: true,
	primitiveGroup: true,
	connectionsGroup: true,
	actionsGroup: true,
	styleGroup: true,
	toolsGroup: true,
	exploreGroup: false,
	fullScreenResults: false,
	showResultsEdit: true
};

if (is_ebook) {
	viewConfig.sideBarWidth = 250;
	viewConfig.referenceBarWidth = 150;
	viewConfig.focusDiagram = false;
	viewConfig.saveEnabled = false;
	viewConfig.showLogo = false;
	viewConfig.primitiveGroup = false;
	viewConfig.actionsGroup = true;
	viewConfig.styleGroup = false;
	viewConfig.runFlush = true;
	viewConfig.fullScreenResults = true;
	viewConfig.showResultsEdit = false;

}

if (is_embed) {
	viewConfig.sideBarWidth = 200;
	viewConfig.referenceBarWidth = 150;
	viewConfig.focusDiagram = false;
	viewConfig.saveEnabled = false;
	viewConfig.buttonGroups = false;
	viewConfig.primitiveGroup = false;
	viewConfig.connectionsGroup = false;
	viewConfig.actionsGroup = false;
	viewConfig.styleGroup = false;
	viewConfig.toolsGroup = false;
	viewConfig.fullScreenResults = true;
	viewConfig.showResultsEdit = false;

}

if (!is_editor) {
	viewConfig.saveEnabled = false;
	viewConfig.primitiveGroup = false;
	viewConfig.connectionsGroup = false;
	viewConfig.actionsGroup = false;
	viewConfig.styleGroup = false;
	viewConfig.toolsGroup = true;
	if (!is_embed) {
		viewConfig.exploreGroup = true;
	}
	viewConfig.showResultsEdit = false;
}




Ext.onReady(function () {
	setTimeout(function () {
		setTimeout(function () {
			try {
				Ext.get('model-overview').fadeOut({
					duration: 1000,
					remove: true
				});
			} catch (err) {

			}
		}, 250)
		Ext.get('loading').remove();
		Ext.get('loading-mask').fadeOut({
			remove: true
		});

	},
		250);
});
