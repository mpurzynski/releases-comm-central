# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

                        <deck id="msgHeaderViewDeck" selectedIndex="0"
                              persist="selectedIndex" flex="1"
                              context="header-toolbar-context-menu">

                          <!-- the message pane consists of 3 'boxes'. Box #2 is the expanded headers view (the default view) -->
                          <vbox id="expandedHeaderView" flex="1">

                            <!-- a convenience box for ease of extension overlaying -->
                            <vbox id="expandedHeadersBox" flex="1">

                              <!-- This hbox has display:block set to imbue it with the HTML layout
                                   model. This lets us float the message header toolbar to the right
                                   so we don't waste space when the From field and the toolbar could
                                   fit alongside each other. -->
                              <hbox id="expandedHeadersTopBox" flex="1">

                                <toolbox id="header-view-toolbox"
                                         class="inline-toolbox"
                                         defaulticonsize="small"
                                         minwidth="50px"
                                         defaultlabelalign="end"
                                         defaultmode="full"
                                         inlinetoolbox="true">
                                  <toolbarpalette id="header-view-toolbar-palette">
                                    <!-- XXXdmose need to move these commands to a controller, either
                                         on the header view, the message pane, or the default
                                         controller -->

                                    <!-- XXXdmose need to audit our shortcut/a11y setup and make sure
                                         these buttons are doing the right thing -->

                                    <toolbarbutton id="hdrForwardButton"
                                                   label="&hdrForwardButton1.label;"
                                                   tooltiptext="&hdrForwardButton1.tooltip;"
                                                   oncommand="MsgForwardMessage(event);RestoreFocusAfterHdrButton();"
                                                   observes="button_forward"
                                                   class="toolbarbutton-1 msgHeaderView-button hdrForwardButton"/>
                                    <toolbaritem id="hdrMenuForwardButton" label="&hdrMenuForwardButton.label;">
                                    <!-- This toolbaritem is a dummy and should only be shown when
                                         customizing the toolbar to distinguish the forward button
                                         from the forward dual-button. -->
                                      <toolbarbutton id="hdrDualForwardButton"
                                                     label="&hdrForwardButton1.label;"
                                                     tooltiptext="&hdrForwardButton1.tooltip;"
                                                     oncommand="MsgForwardMessage(event);RestoreFocusAfterHdrButton();"
                                                     observes="button_forward"
                                                     class="toolbarbutton-1 msgHeaderView-button hdrForwardButton"
                                                     type="menu-button">
                                        <menupopup id="hdrForwardDropdown">
                                          <menuitem id="hdrForwardAsInlineMenu"
                                                    label="&buttonMenuForwardAsInline.label;"
                                                    tooltiptext="&forwardAsInline.tooltip;"
                                                    command="cmd_forwardInline"/>
                                          <menuitem id="hdrForwardAsAttachmentMenu"
                                                    label="&buttonMenuForwardAsAttachment.label;"
                                                    tooltiptext="&forwardAsAttachment.tooltip;"
                                                    command="cmd_forwardAttachment"/>
                                        </menupopup>
                                      </toolbarbutton>
                                    </toolbaritem>
                                    <toolbarbutton id="hdrArchiveButton"
                                                   label="&hdrArchiveButton1.label;"
                                                   tooltiptext="&hdrArchiveButton1.tooltip;"
                                                   oncommand="MsgArchiveSelectedMessages(event);RestoreFocusAfterHdrButton();"
                                                   observes="button_archive"
                                                   class="toolbarbutton-1 msgHeaderView-button hdrArchiveButton"/>
                                    <toolbarbutton id="hdrJunkButton" label="&hdrJunkButton1.label;"
                                                   tooltiptext="&hdrJunkButton1.tooltip;"
                                                   observes="button_junk"
                                                   class="toolbarbutton-1 msgHeaderView-button hdrJunkButton"
                                                   oncommand="goDoCommand('button_junk');RestoreFocusAfterHdrButton();"/>
                                    <toolbarbutton id="hdrTrashButton"
                                                   label="&hdrTrashButton1.label;"
                                                   tooltiptext="&hdrTrashButton1.tooltip;"
                                                   observes="button_delete"
                                                   class="toolbarbutton-1 msgHeaderView-button hdrTrashButton"
                                                   oncommand="goDoCommand(event.shiftKey ? 'button_shiftDelete' :
                                                                          'button_delete');RestoreFocusAfterHdrButton();"/>
                                    <toolbarbutton id="hdrOpenConversationButton"
                                                   label="&hdrOpenConversationButton1.label;"
                                                   tooltiptext="&hdrOpenConversationButton1.tooltip;"
                                                   observes="button_showconversation"
                                                   class="toolbarbutton-1 msgHeaderView-button hdrConversationButton"
                                                   oncommand="gConversationOpener.openConversationForMessages(gFolderDisplay.selectedMessages);RestoreFocusAfterHdrButton();"/>
                                    <toolbarbutton id="hdrReplyToSenderButton" label="&hdrReplyButton1.label;"
                                                   tooltiptext="&hdrReplyButton2.tooltip;"
                                                   oncommand="MsgReplySender(event);RestoreFocusAfterHdrButton();"
                                                   observes="button_reply"
                                                   class="toolbarbutton-1 msgHeaderView-button hdrReplyToSenderButton"/>
                                    <toolbaritem id="hdrSmartReplyButton" label="&hdrSmartReplyButton1.label;">
                                      <!-- This button is a dummy and should only be shown when
                                           customizing the toolbar to distinguish the smart reply
                                           button from the reply to sender button. -->
                                      <toolbarbutton id="hdrDummyReplyButton" label="&hdrSmartReplyButton1.label;"
                                                     hidden="true"
                                                     class="toolbarbutton-1 msgHeaderView-button hdrDummyReplyButton"/>
                                      <toolbarbutton id="hdrReplyButton" label="&hdrReplyButton1.label;"
                                                     tooltiptext="&hdrReplyButton2.tooltip;"
                                                     oncommand="MsgReplySender(event);RestoreFocusAfterHdrButton();"
                                                     observes="button_reply"
                                                     class="toolbarbutton-1 msgHeaderView-button hdrReplyButton"/>
                                      <toolbarbutton id="hdrReplyAllButton"
                                                     label="&hdrReplyAllButton1.label;"
                                                     tooltiptext="&hdrReplyAllButton1.tooltip;"
                                                     oncommand="MsgReplyToAllMessage(event);RestoreFocusAfterHdrButton();"
                                                     observes="button_replyall"
                                                     class="toolbarbutton-1 msgHeaderView-button hdrReplyButton hdrReplyAllButton"
                                                     type="menu-button"
                                                     hidden="true">
                                        <menupopup id="hdrReplyAllDropdown">
                                          <menuitem id="hdrReplyAll_ReplyAllSubButton"
                                                    label="&hdrReplyAllButton1.label;"
                                                    tooltiptext="&hdrReplyAllButton1.tooltip;"
                                                    observes="button_replyall"/>
                                          <menuseparator id="hdrReplyAllSubSeparator"/>
                                          <menuitem id="hdrReplySubButton"
                                                    label="&hdrReplyButton1.label;"
                                                    tooltiptext="&hdrReplyButton2.tooltip;"
                                                    observes="button_reply"
                                                    oncommand="MsgReplySender(event); event.stopPropagation();
                                                               RestoreFocusAfterHdrButton();"/>
                                        </menupopup>
                                      </toolbarbutton>
                                      <toolbarbutton id="hdrReplyListButton"
                                                     label="&hdrReplyListButton1.label;"
                                                     tooltiptext="&hdrReplyListButton1.tooltip;"
                                                     oncommand="MsgReplyToListMessage(event);RestoreFocusAfterHdrButton();"
                                                     observes="button_replylist"
                                                     class="toolbarbutton-1 msgHeaderView-button hdrReplyButton hdrReplyListButton"
                                                     type="menu-button"
                                                     hidden="true">
                                        <menupopup id="hdrReplyListDropdown">
                                          <menuitem id="hdrReplyList_ReplyListSubButton"
                                                    label="&hdrReplyListButton1.label;"
                                                    tooltiptext="&hdrReplyListButton1.tooltip;"
                                                    observes="button_replylist"/>
                                          <menuseparator id="hdrReplyListSubSeparator"/>
                                          <menuitem id="hdrRelplyList_ReplyAllSubButton"
                                                    label="&hdrReplyAllButton1.label;"
                                                    tooltiptext="&hdrReplyAllButton1.tooltip;"
                                                    observes="button_replyall"
                                                    oncommand="MsgReplyToAllMessage(event); event.stopPropagation();
                                                               RestoreFocusAfterHdrButton();"/>
                                          <menuitem id="hdrReplyList_ReplySubButton"
                                                    label="&hdrReplyButton1.label;"
                                                    tooltiptext="&hdrReplyButton2.tooltip;"
                                                    observes="button_reply"
                                                    oncommand="MsgReplySender(event); event.stopPropagation();
                                                               RestoreFocusAfterHdrButton();"/>
                                        </menupopup>
                                      </toolbarbutton>
                                      <toolbarbutton id="hdrFollowupButton" label="&hdrFollowupButton1.label;"
                                                     tooltiptext="&hdrFollowupButton1.tooltip;"
                                                     oncommand="MsgReplyGroup(event);RestoreFocusAfterHdrButton();"
                                                     observes="button_followup"
                                                     class="toolbarbutton-1 msgHeaderView-button hdrFollowupButton"
                                                     type="menu-button">
                                        <menupopup id="hdrFollowupDropdown">
                                          <menuitem id="hdrFollowup_FollowupSubButton"
                                                    label="&hdrFollowupButton1.label;"
                                                    tooltiptext="&hdrFollowupButton1.tooltip;"
                                                    observes="button_followup"/>
                                          <menuseparator id="hdrFollowupSubSeparator"/>
                                          <menuitem id="hdrFollowup_ReplyAllSubButton"
                                                    label="&hdrReplyAllButton1.label;"
                                                    tooltiptext="&hdrReplyAllButton1.tooltip;"
                                                    observes="button_replyall"
                                                    oncommand="MsgReplyToAllMessage(event); event.stopPropagation();
                                                               RestoreFocusAfterHdrButton();"/>
                                          <menuitem id="hdrFollowup_ReplySubButton"
                                                    label="&hdrReplyButton1.label;"
                                                    tooltiptext="&hdrReplyButton2.tooltip;"
                                                    observes="button_reply"
                                                    oncommand="MsgReplySender(event); event.stopPropagation();
                                                               RestoreFocusAfterHdrButton();"/>
                                        </menupopup>
                                      </toolbarbutton>
                                    </toolbaritem>
                                    <toolbarbutton id="hdrTagButton"
                                                   type="menu"
                                                   class="toolbarbutton-1 msgHeaderView-button hdrTagButton"
                                                   label="&tagButton.label;"
                                                   tooltiptext="&tagButton.tooltip;"
                                                   command="cmd_tag">
                                      <menupopup id="hdrTagDropdown"
                                                 onpopupshowing="InitMessageTags(this);">
                                        <menuitem id="hdrTagDropdown-addNewTag"
                                                  label="&addNewTag.label;"
                                                  accesskey="&addNewTag.accesskey;"
                                                  command="cmd_addTag"/>
                                        <menuitem id="manageTags"
                                                  label="&manageTags.label;"
                                                  accesskey="&manageTags.accesskey;"
                                                  command="cmd_manageTags"/>
                                        <menuseparator id="hdrTagDropdown-sep-afterAddNewTag"/>
                                        <menuitem id="hdrTagDropdown-tagRemoveAll"
                                                  command="cmd_removeTags"/>
                                        <menuseparator id="hdrTagDropdown-sep-afterTagRemoveAll"/>
                                      </menupopup>
                                    </toolbarbutton>
                                    <toolbarbutton type="menu"
                                                   id="otherActionsButton"
                                                   label="&otherActionsButton2.label;"
                                                   tooltiptext="&otherActionsButton.tooltip;"
                                                   class="toolbarbutton-1 msgHeaderView-button">
                                      <menupopup id="otherActionsPopup"
                                                 onpopupshowing="onShowOtherActionsPopup();">
#ifdef MAIN_WINDOW
                                        <menuitem id="otherActionsOpenConversation"
                                                  label="&otherActionsOpenConversation1.label;"
                                                  accesskey="&otherActionsOpenConversation1.accesskey;"
                                                  oncommand="gConversationOpener.openConversationForMessages(gFolderDisplay.selectedMessages);"/>
#endif
                                        <menuitem id="otherActionsOpenInNewWindow"
                                                  label="&otherActionsOpenInNewWindow1.label;"
                                                  accesskey="&otherActionsOpenInNewWindow1.accesskey;"
                                                  observes="otherActionsOpenIn"
                                                  oncommand="MsgOpenNewWindowForMessage();"/>
                                        <menuitem id="otherActionsOpenInNewTab"
                                                  label="&otherActionsOpenInNewTab1.label;"
                                                  accesskey="&otherActionsOpenInNewTab1.accesskey;"
                                                  observes="otherActionsOpenIn"
                                                  oncommand="OpenMessageInNewTab(event);"/>
                                        <menuitem id="viewSourceMenuItem"
                                                  label="&viewSourceMenuItem1.label;"
                                                  accesskey="&viewSourceMenuItem1.accesskey;"
                                                  oncommand="ViewPageSource(gFolderDisplay.selectedMessageUris);" />
                                        <menuseparator id="otherActionsSeparator"/>
                                        <menuitem id="markAsReadMenuItem"
                                                  label="&markAsReadMenuItem1.label;"
                                                  accesskey="&markAsReadMenuItem1.accesskey;"
                                                  oncommand="MsgMarkMsgAsRead();"/>
                                        <menuitem id="markAsUnreadMenuItem"
                                                  label="&markAsUnreadMenuItem1.label;"
                                                  accesskey="&markAsUnreadMenuItem1.accesskey;"
                                                  oncommand="MsgMarkMsgAsRead();"/>
                                        <menuitem id="saveAsMenuItem" label="&saveAsMenuItem1.label;"
                                                  accesskey="&saveAsMenuItem1.accesskey;"
                                                  oncommand="MsgSaveAsFile();"/>
                                        <menuitem id="otherActionsPrint"
                                                  label="&otherActionsPrint1.label;"
                                                  accesskey="&otherActionsPrint1.accesskey;"
                                                  oncommand="PrintEnginePrint();"/>
                                      </menupopup>
                                    </toolbarbutton>
                                  </toolbarpalette>

                                  <toolbar id="header-view-toolbar" class="inline-toolbar" align="start"
                                           customizable="true" mode="full"
                                           context="header-toolbar-context-menu"
                                           defaulticonsize="small" defaultmode="full"
                                           defaultset="hdrReplyToSenderButton,hdrSmartReplyButton,hdrForwardButton,hdrArchiveButton,hdrJunkButton,hdrTrashButton,otherActionsButton"/>
                                </toolbox>

                                <!-- This box ensures that the expandedHeaders grid below is aligned
                                     with the bottom of the message header toolbar. Like the
                                     expandedHeadersTopBox, this uses display:block to give us HTML
                                     layouting. -->
                                <box id="expandedBoxSpacer"/>

                                <!-- Theoretically, we should be able to replace this grid with just
                                     an hbox.  Unfortunately, doing that makes it very hard to sync
                                     the column sizes between the name columns, because for currently
                                     unclear reasons, the .clientWidth of a column is wider than the
                                     .clientWidth of its largest contained child by an unspecified
                                     amount. -->
                                <grid id="expandedHeaders">

                                  <columns id="expandedHeadersColumns">
                                    <column id="expandedHeadersNameColumn"/>
                                    <column id="expandedHeadersValueColumn" flex="1"/>
                                  </columns>

                                  <rows id="expandedHeaderRows">
                                    <row id="expandedfromRow">
                                      <label id="expandedfromLabel" class="headerName"
                                             value="&fromField4.label;"
                                             valueFrom="&fromField4.label;" valueAuthor="&author.label;"
                                             control="expandedfromBox"/>
                                      <mail-multi-emailHeaderField id="expandedfromBox" flex="1"/>
                                    </row>
                                  </rows>
                                </grid>
                              </hbox>

                              <hbox id="expandedHeadersBottomBox">

                                <!-- The grid that contains all headers except the first one,
                                      including any headers created dynamically from JavaScript -->
                                <grid id="expandedHeaders2" flex="1">

                                  <columns id="expandedHeaders2Columns">
                                    <column id="expandedHeaders2NameColumn"/>
                                    <column id="expandedHeaders2ValueColumn" flex="1"/>
                                  </columns>

                                  <rows id="expandedHeader2Rows">

                                    <!-- Commonly used rows are pre-specified in the XUL to avoid the
                                         performance hit of creating them dynamically. -->
                                    <row id="expandedsubjectRow">
                                      <label id="expandedsubjectLabel" class="headerName"
                                             value="&subjectField4.label;"
                                             control="expandedsubjectBox"/>
                                      <mail-headerfield id="expandedsubjectBox" flex="1"
                                                        headerName="subject"/>
                                    </row>
                                    <row id="expandedorganizationRow" collapsed="true">
                                      <label id="expandedorganizationLabel" class="headerName"
                                             value="&organizationField4.label;"
                                             control="expandedorganizationBox"/>
                                      <mail-headerfield id="expandedorganizationBox"/>
                                    </row>
                                    <row id="expandedsenderRow" collapsed="true">
                                      <label id="expandedsenderLabel" class="headerName"
                                             value="&senderField4.label;" control="expandedsenderBox"/>
                                      <mail-emailheaderfield id="expandedsenderBox"/>
                                    </row>
                                    <row id="expandedreply-toRow" collapsed="true">
                                      <label id="expandedreply-toLabel" class="headerName"
                                             value="&replyToField4.label;"
                                             control="expandedreply-toBox"/>
                                      <mail-multi-emailHeaderField id="expandedreply-toBox"/>
                                    </row>
                                    <row id="expandedtoRow" collapsed="true">
                                      <label id="expandedtoLabel" class="headerName"
                                             value="&toField4.label;" control="expandedtoBox"/>
                                      <mail-multi-emailHeaderField id="expandedtoBox" flex="1"/>
                                    </row>
                                    <row id="expandedccRow" collapsed="true">
                                      <label id="expandedccLabel" class="headerName"
                                             value="&ccField4.label;" control="expandedccBox"/>
                                      <mail-multi-emailHeaderField id="expandedccBox" flex="1"/>
                                    </row>
                                    <row id="expandedbccRow" collapsed="true">
                                      <label id="expandedbccLabel" class="headerName"
                                             value="&bccField4.label;" control="expandedbccBox"/>
                                      <mail-multi-emailHeaderField id="expandedbccBox"/>
                                    </row>
                                    <row id="expandednewsgroupsRow" collapsed="true">
                                      <label id="expandednewsgroupsLabel" class="headerName"
                                             value="&newsgroupsField4.label;"
                                             control="expandednewsgroupsBox"/>
                                      <mail-newsgroups-headerfield id="expandednewsgroupsBox" flex="1"/>
                                    </row>
                                    <row id="expandedfollowup-toRow" collapsed="true">
                                      <label id="expandedfollowup-toLabel" class="headerName"
                                             value="&followupToField4.label;"
                                             control="expandedfollowup-toBox"/>
                                      <mail-newsgroups-headerfield id="expandedfollowup-toBox" flex="1"/>
                                    </row>
                                    <row id="expandeddateRow" collapsed="true">
                                      <label id="expandeddateLabel" class="headerName"
                                             value="&dateField4.label;" control="expandeddateBox"/>
                                      <mail-headerfield id="expandeddateBox" flex="1"/>
                                    </row>
                                    <row id="expandedmessage-idRow" collapsed="true">
                                      <label id="expandedmessage-idLabel" class="headerName"
                                             value="&messageIdField4.label;"
                                             control="expandedmessage-idBox"/>
                                      <mail-messageids-headerfield id="expandedmessage-idBox"/>
                                    </row>
                                    <row id="expandedin-reply-toRow" collapsed="true">
                                      <label id="expandedin-reply-toLabel" class="headerName"
                                             value="&inReplyToField4.label;"
                                             control="expandedin-reply-toBox"/>
                                      <mail-messageids-headerfield id="expandedin-reply-toBox"/>
                                    </row>
                                    <row id="expandedreferencesRow" collapsed="true">
                                      <label id="expandedreferencesLabel" class="headerName"
                                             value="&referencesField4.label;"
                                             control="expandedreferencesBox"/>
                                      <mail-messageids-headerfield id="expandedreferencesBox"
                                                                   flex="1"/>
                                    </row>
                                    <row id="expandedtagsRow" collapsed="true">
                                      <label id="expandedtagsLabel" class="headerName"
                                             value="&tagsHdr4.label;" control="expandedtagsBox"/>
                                      <mail-tagfield id="expandedtagsBox"/>
                                    </row>
                                    <row id="expandedcontent-baseRow" collapsed="true">
                                      <label id="expandedcontent-baseLabel" class="headerName"
                                             value="&originalWebsite4.label;"
                                             control="expandedcontent-baseBox"/>
                                      <mail-urlfield id="expandedcontent-baseBox"/>
                                    </row>
                                    <row id="expandeduser-agentRow" collapsed="true">
                                      <label id="expandeduser-agentLabel" class="headerName"
                                             value="&userAgentField4.label;"
                                             control="expandeduser-agentBox"/>
                                      <mail-headerfield id="expandeduser-agentBox" flex="1"/>
                                    </row>
                                  </rows>
                                </grid>

                                <!-- perhaps this should be a customizable toolbar too -->
                                <vbox id="otherActionsBox" align="end">
                                  <hbox id="dateValueBox" align="top" flex="1">  <!--For extensions-->
                                    <hbox id="smimeBox" insertbefore="dateLabel" collapsed="true">
                                      <image id="signedHdrIcon"
                                            onclick="showMessageReadSecurityInfo();" collapsed="true"/>
                                      <image id="encryptedHdrIcon"
                                            onclick="showMessageReadSecurityInfo();" collapsed="true"/>
                                    </hbox>
                                    <label id="dateLabel" class="dateLabel" flex="1" role="textbox"
                                           aria-readonly="true"/>
                                  </hbox>
                                </vbox>
                              </hbox>
                            </vbox>
                          </vbox>
                        </deck>
