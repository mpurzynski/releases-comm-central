# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

      <vbox id="imageLocation">
        <spacer class="spacer"/>
        <label control = "srcInput"
          value = "&locationEditField.label;"
          accesskey="&locationEditField.accessKey;"
          tooltiptext="&locationEditField.tooltip;"
          />
        <tooltip id="shortenedDataURI">
          <label value="&locationEditField.shortenedDataURI;"/>
        </tooltip>
        <textbox id="srcInput" oninput="ChangeImageSrc();" tabindex="1" class="uri-element"
                 tooltiptext="&locationEditField.tooltip;"/>
        <hbox id="MakeRelativeHbox">
          <checkbox id="MakeRelativeCheckbox"
                    for="srcInput"
                    tabindex="2"
                    label="&makeUrlRelative.label;"
                    accesskey="&makeUrlRelative.accessKey;"
                    oncommand="MakeInputValueRelativeOrAbsolute(this);"
                    tooltiptext="&makeUrlRelative.tooltip;"/>
          <checkbox id="AttachSourceToMail"
                    hidden="true"
                    label="&attachImageSource.label;"
                    accesskey="&attachImageSource.accesskey;"
                    oncommand="DoAttachSourceCheckbox()"/>
          <spacer flex="1"/>
          <button id="ChooseFile"
                  tabindex="3"
                  oncommand="chooseFile()"
                  label="&chooseFileButton.label;"
                  accesskey="&chooseFileButton.accessKey;"/>
        </hbox>
        <spacer class="spacer"/>
        <radiogroup id="altTextRadioGroup" flex="1">
          <grid>
            <columns><column/><column flex="1"/></columns>
            <rows>
              <row align="center">
                <label
                  style   = "margin-left: 26px"
                  control = "titleInput"
                  accesskey = "&title.accessKey;"
                  value   ="&title.label;"
                  tooltiptext="&title.tooltip;"
                  for     = "titleInput"/>
                <textbox flex="1"
                  id      = "titleInput"
                  class   = "MinWidth20em"
                  tooltiptext="&title.tooltip;"
                  tabindex="4"/>
              </row>
              <row align="center">
                <radio id = "altTextRadio"
                  label   = "&altText.label;"
                  accesskey = "&altText.accessKey;"
                  tooltiptext="&altTextEditField.tooltip;"
#ifndef MOZ_SUITE
            persist="selected"
#endif
                  oncommand = "SetAltTextDisabled(false);"
                  tabindex="5"/>
                <textbox flex="1"
                  id      = "altTextInput"
                  class   = "MinWidth20em"
                  tooltiptext="&altTextEditField.tooltip;"
                  oninput = "SetAltTextDisabled(false);"
                  tabindex="6"/>
              </row>
            </rows>
          </grid>

          <radio id = "noAltTextRadio"
            label   = "&noAltText.label;"
            accesskey = "&noAltText.accessKey;"
#ifndef MOZ_SUITE
            persist="selected"
#endif
            oncommand = "SetAltTextDisabled(true);"/>
        </radiogroup>
      </vbox>

      <vbox id="imageDimensions" align="start">
        <spacer class="spacer"/>
        <hbox>
          <radiogroup id="imgSizeGroup">
            <radio
              id      = "actualSizeRadio"
              label   = "&actualSizeRadio.label;"
              accesskey = "&actualSizeRadio.accessKey;"
              tooltiptext="&actualSizeRadio.tooltip;"
              oncommand = "SetActualSize()"/>
            <radio
              id      = "customSizeRadio"
              label   = "&customSizeRadio.label;"
              selected = "true"
              accesskey = "&customSizeRadio.accessKey;"
              tooltiptext="&customSizeRadio.tooltip;"
              oncommand = "doDimensionEnabling();" />
          </radiogroup>
          <spacer flex="1"/>
          <vbox>
            <spacer flex="1"/>
            <checkbox id="constrainCheckbox" label="&constrainCheckbox.label;"
                 accesskey="&constrainCheckbox.accessKey;"
                 oncommand="ToggleConstrain()"
                 tooltiptext="&constrainCheckbox.tooltip;"/>
          </vbox>
          <spacer flex="1"/>
        </hbox>
        <spacer class="spacer"/>
        <grid class="indent">
          <columns><column/><column/><column flex="1"/></columns>
          <rows>
            <row align="center">
              <label id    = "widthLabel"
                control   = "widthInput"
                accesskey = "&widthEditField.accessKey;"
                value = "&widthEditField.label;" />
              <textbox
                id       = "widthInput"
                class    = "narrow"
                oninput  = "constrainProportions(this.id, 'heightInput')"/>
              <menulist id = "widthUnitsMenulist"
                oncommand = "doDimensionEnabling();" />
              <!-- contents are appended by JS -->
            </row>
            <row align="center">
              <label id    = "heightLabel"
                control   = "heightInput"
                accesskey = "&heightEditField.accessKey;"
                value = "&heightEditField.label;" />
              <textbox
                id       = "heightInput"
                class    = "narrow"
                oninput  = "constrainProportions(this.id, 'widthInput')"/>
              <menulist id = "heightUnitsMenulist"
                oncommand = "doDimensionEnabling();" />
              <!-- contents are appended by JS -->
            </row>
          </rows>
        </grid>
        <spacer flex="1"/>
      </vbox>

      <hbox id="imageAppearance">
        <groupbox>
          <caption id="spacingLabel">&spacingBox.label;</caption>
          <grid>
            <columns><column/><column/><column/></columns>
            <rows>
              <row align="center">
                <label
                  class = "align-right"
                  id    = "leftrightLabel"
                  control = "imageleftrightInput"
                  accesskey = "&leftRightEditField.accessKey;"
                  value = "&leftRightEditField.label;"/>
                <textbox
                  class     = "narrow"
                  id        = "imageleftrightInput"
                  oninput   = "forceInteger(this.id)"/>
                <label
                  id    = "leftrighttypeLabel"
                  value = "&pixelsPopup.value;" />
              </row>
              <spacer class="spacer"/>
              <row align="center">
                <label
                  class = "align-right"
                  id    = "topbottomLabel"
                  control = "imagetopbottomInput"
                  accesskey = "&topBottomEditField.accessKey;"
                  value = "&topBottomEditField.label;"/>
                <textbox
                  class     = "narrow"
                  id        = "imagetopbottomInput"
                  oninput   = "forceInteger(this.id)"/>
                <label id="topbottomtypeLabel"
                       value="&pixelsPopup.value;" />
              </row>
              <spacer class="spacer"/>
              <row align="center">
                <label class="align-right"
                       id="borderLabel"
                       control="border"
                       accesskey="&borderEditField.accessKey;"
                       value="&borderEditField.label;"/>
                <textbox
                  class     = "narrow"
                  id        = "border"
                  oninput   = "forceInteger(this.id)"/>
                <label id="bordertypeLabel"
                       value="&pixelsPopup.value;" />
              </row>
            </rows>
          </grid>
        </groupbox>

        <vbox>
          <groupbox align="start">
            <caption id="alignLabel">&alignment.label;</caption>
            <menulist id="alignTypeSelect" class="align-menu">
              <menupopup>
                <menuitem class="align-menu menuitem-iconic"
                          value="top"
                          label="&topPopup.value;"/>
                <menuitem class="align-menu menuitem-iconic"
                          value="middle"
                          label="&centerPopup.value;"/>
                <menuitem class="align-menu menuitem-iconic"
                          value="bottom"
                          label="&bottomPopup.value;"/>
                <!-- HTML attribute value is opposite of the button label on purpose -->
                <menuitem class="align-menu menuitem-iconic"
                          value="right"
                          label="&wrapLeftPopup.value;"/>
                <menuitem class="align-menu menuitem-iconic"
                          value="left"
                          label="&wrapRightPopup.value;"/>
              </menupopup>
            </menulist>
          </groupbox>

          <groupbox>
            <caption id="imagemapLabel">&imagemapBox.label;</caption>
            <hbox equalsize="always">
            <button id="removeImageMap"
                    oncommand="removeImageMap()"
                    accesskey="&removeImageMapButton.accessKey;"
                    label="&removeImageMapButton.label;"
                    flex="1"/>
            <spacer flex="1"/><!-- remove when we restore Image Map Editor -->
            </hbox>
          </groupbox>
        </vbox>
      </hbox>
