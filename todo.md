- qr codes block on object pages for example - http://localhost:8000/dcim/devices/35/. should support i18n, now it is always english. It should show all available qr codes for the object (active ones). list them here in nice and beautiful way, with a title and not interfere with each other.
- same for settings and every other place - i18n should be supported. 
- template should have size field (mm) for we can filter by it for example and set it as a default size for visual editor.
- in the templates table add a button to open visual editor for the template. it should open visual editor with the template loaded and ready to edit.
- i think we can remove "Editor mode" setting from the template page. just left here inputs for html, css and js and add a message what we can edit in visual editor on the template page or from the templates table. we can also add a link to visual editor.
- visual editor should have zoom functionality, so we can zoom in and out of the template. it should also have a reset zoom button to reset the zoom level to default. zoom can be happening by mouse and touch gestures, as well as by buttons in the visual editor interface.
- visual editor toolbar should have such buttons: undo, redo, zoom in, zoom out, reset zoom, add object dropdown menu with options (text, image, qr code), save template (icon only), preview template (icon only), dropdown with dimensions settings (add presets for the most common label printer sizes). The toolbar should be responsive and adapt to different screen sizes.
- there should be no delete button in the visual editor toolbar, delete icon should be shown near the selected object in the visual editor. When the object is selected, the delete icon should be visible and clickable to remove the object from the template. No need to ask for confirmation, just delete it immediately. If the object is not selected, the delete icon should be hidden.



## second bulk of tasks
- sizes/dimensions presets should be editable by user so he can create/delete/update them. that model should have name, description, dimensions.
- from visual editor page remove "скасувати" button, just add icon button with go back arrow icon to go back to the templates table. It should be placed after preview/save buttons in the toolbar. It should be responsive and adapt to different screen sizes.
- in visual editor properties panel doesn't have translations, need to fix that.
- preview dialog in visual editor by default should show previewed label in that dialog, not on the separate page. It should display print button and select interface for the real object here. so when real object selected preview will updated and using real object data instead of placeholder data. It should also have a close button to close the preview dialog and return to the visual editor. The preview dialog should be responsive and adapt to different screen sizes.
- in visual editor preview object type selector should only contain template's content types, not all content types. It should be filtered to only show content types that are related to the templates. If only 1 content type is available, it should be selected by default and the selector should be hidden. If more than 1 content type is available, the selector should be shown and allow the user to select the content type for previewing.

# third bulk of tasks
- in amin/plugins/qr plugin add tabs with installation instructions for different platforms (docker, docker-compose, pip install, etc.). It should be responsive and adapt to different screen sizes. It should also have a search functionality to quickly find the installation instructions for a specific platform. The tabs should be clearly labeled and easy to navigate.
- for some reason half of text on the app is on english, but it was on ukrainian before we added that plugin, check this. i think we have a bug.
