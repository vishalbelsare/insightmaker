"use strict";
/*

Copyright 2010-2020 Scott Fortmann-Roe. All rights reserved.

This file may distributed and/or modified under the
terms of the Insight Maker Public License (https://InsightMaker.com/impl).

*/

var RichTextEditor = Ext.extend(Ext.form.TextField, {
	enableKeyEvents: false,
	selectOnFocus: true,
	triggers: {
		edit: {
			hideOnReadOnly: false,
			handler: function () {
				this.editorWindow = new RichTextWindow({
					parent: this,
					html: this.getValue()
				});
				this.editorWindow.show();
			}
		}
	},

	listeners: {
		'keydown': function (field) {
			field.setEditable(false);
		},
		'beforerender': function () {
			if (this.regex != undefined) {
				this.validator = function (value) {
					return this.regex.test(value);
				};
			}

		}
	}
});


function RichTextWindow(config) {
	var me = this;


	var win = new Ext.Window({
		title: getText('Note Editor'),
		closeAction: 'destroy',
		border: false,
		modal: true,
		resizable: true,
		maximizable: true,
		stateful: is_editor && (!is_embed),
		stateId: "richtext_window",
		shadow: true,
		buttonAlign: 'right',
		width: Math.min(Ext.getBody().getViewSize().width, 520),
		height: Math.min(Ext.getBody().getViewSize().height, 400),
		items: [
			Ext.create('Ext.toolbar.Toolbar', {
				enableOverflow: true,
				items: [
					{
						glyph: 0xf032,
						tooltip: 'Bold',
						handler: () => {
							document.execCommand('bold');
						}
					},
					{
						glyph: 0xf033,
						tooltip: 'Italic',
						handler: () => {
							document.execCommand('italic');
						}
					},
					{
						glyph: 0xf0cd,
						tooltip: 'Underline',
						handler: () => {
							document.execCommand('underline');
						}
					},
					'-',
					{
						glyph: 0xf036,
						tooltip: 'Left align',
						handler: () => {
							document.execCommand('justifyLeft');
						}
					},
					{
						glyph: 0xf037,
						tooltip: 'Center',
						handler: () => {
							document.execCommand('justifyCenter');
						}
					},
					{
						glyph: 0xf038,
						tooltip: 'Right align',
						handler: () => {
							document.execCommand('justifyRight');
						}
					},
					'-',
					{
						glyph: 0xf0c1,
						tooltip: 'Insert link',
						handler: () => {
							var url = prompt('Enter a URL')
							if (url) {
								document.execCommand('createLink', true, url);
								$('#noteEditor a').attr('target', '_blank');
							}
						}
					},
					'-',
					{
						glyph: 0xf0cb,
						tooltip: 'Numbered list',
						handler: () => {
							document.execCommand('insertOrderedList');
						}
					},
					{
						glyph: 0xf0ca,
						tooltip: 'Bullet list',
						handler: () => {
							document.execCommand('insertUnorderedList');
						}
					}
				]
			}),
			{
				html: '<div id="noteEditor" style="height: 260px; border: solid 1px #cecece; padding: 4px 6px 3px 6px; overflow: auto;" contenteditable>' + clean(config.html) + '</div>'
			}
		],
		buttons: [{
			scale: "large",
			glyph: 0xf05c,
			text: getText('Cancel'),
			handler: function () {
				win.close();
				if (config.parent != "") {
					config.parent.resumeEvents();
				}
			}
		}, {
			scale: "large",
			glyph: 0xf00c,
			text: getText('Apply'),
			handler: function () {
				let newHtml = clean(document.getElementById('noteEditor').innerHTML);
				if (config.parent != "") {
					editingRecord.set("value", newHtml);
					saveConfigRecord(editingRecord);
				} else {
					graph.getModel().beginUpdate();
					setNote(config.cell, newHtml);
					graph.getModel().endUpdate();
					selectionChanged(false);
				}

				win.close();
			}
		}]
	});

	me.show = function () {
		win.show();
	}
}
