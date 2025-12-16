sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Menu",
    "sap/m/MenuItem"
], function (Controller, JSONModel, Filter, FilterOperator, MessageBox, MessageToast, Menu, MenuItem) {
    "use strict";

    return Controller.extend("com.mycompany.orderbrowser.controller.App", {

        _iGenerationInterval: null, 

        onInit: function () {
            // 1. Get Real User Name (if available)
            var sUser = "Current User";
            var sInitials = "CU";
            
            // Check if running in Fiori Launchpad
            if (sap.ushell && sap.ushell.Container) {
                var oUserInfo = sap.ushell.Container.getService("UserInfo");
                if(oUserInfo){
                    sUser = oUserInfo.getUser().getFullName();
                    sInitials = sUser.charAt(0) + (sUser.split(" ")[1] ? sUser.split(" ")[1].charAt(0) : "");
                }
            }

            var oViewModel = new JSONModel({
                masterSize: "400px",
                isFullScreen: false,
                
                // User Info
                currentUserName: sUser,
                currentUserInitials: sInitials,

                // Email / AI Properties
                aiState: "generate",
                aiOutputText: "",
                emailTo: "",
                emailTopic: "",
                
                // Hidden data for the AI generator to use
                activePO: "",
                activeVendor: ""
            });
            this.getView().setModel(oViewModel, "appView");
        },

        // ============================================================
        // AI INTEGRATION LOGIC
        // ============================================================

        onOpenAIDialog: function() {
            var oDetail = this.byId("detail");
            var oContext = oDetail.getBindingContext();

            if (!oContext) {
                MessageToast.show("Please select an Order first.");
                return;
            }

            var sPO = oContext.getProperty("PurchaseOrder");
            var sVendor = oContext.getProperty("Supplier");
            
            var oModel = this.getView().getModel("appView");
            oModel.setProperty("/emailTo", ""); 
            oModel.setProperty("/emailTopic", "Inquiry regarding Order " + sPO + " - " + sVendor);
            
            oModel.setProperty("/activePO", sPO);
            oModel.setProperty("/activeVendor", sVendor);

            oModel.setProperty("/aiState", "generate");
            oModel.setProperty("/aiOutputText", "");

            var oDialog = this.byId("aiDialog");
            oDialog.open();
        },

        onAIButtonPress: function() {
            var oModel = this.getView().getModel("appView");
            var sState = oModel.getProperty("/aiState");

            if (sState === "generate") {
                this._startGeneration();
            } else if (sState === "generating") {
                this._stopGeneration();
            } else if (sState === "revise") {
                this._openReviseMenu();
            }
        },

        _startGeneration: function() {
            var oModel = this.getView().getModel("appView");
            oModel.setProperty("/aiState", "generating");
            oModel.setProperty("/aiOutputText", "");

            var sPO = oModel.getProperty("/activePO");
            var sVendor = oModel.getProperty("/activeVendor");
            var sUser = oModel.getProperty("/currentUserName");

            var sFullText = "Dear " + sVendor + ",\n\nI am writing to inquire about the status of Purchase Order #" + sPO + ".\n\nWe would like to confirm the expected delivery date for the line items listed in this order. Please let us know if there are any delays or updates we should be aware of.\n\nThank you for your prompt assistance.\n\nBest regards,\n" + sUser;
            
            var aWords = sFullText.split("");
            var iIndex = 0;
            var that = this;

            this._iGenerationInterval = setInterval(function() {
                if (iIndex < aWords.length) {
                    var sCurrent = oModel.getProperty("/aiOutputText");
                    oModel.setProperty("/aiOutputText", sCurrent + aWords[iIndex]);
                    iIndex++;
                } else {
                    that._stopGeneration();
                }
            }, 25); 
        },

        _stopGeneration: function() {
            if (this._iGenerationInterval) {
                clearInterval(this._iGenerationInterval);
                this._iGenerationInterval = null;
            }
            var oModel = this.getView().getModel("appView");
            oModel.setProperty("/aiState", "revise");
        },

        _openReviseMenu: function() {
            if (!this._oMenu) {
                this._oMenu = new Menu({
                    items: [
                        new MenuItem({text: "Regenerate", icon: "sap-icon://refresh", press: this.onMenuAction.bind(this)}),
                        new MenuItem({text: "Make Shorter", icon: "sap-icon://less", press: this.onMenuAction.bind(this)}),
                        new MenuItem({text: "Make Formal", icon: "sap-icon://official-service", press: this.onMenuAction.bind(this)})
                    ]
                });
                this.getView().addDependent(this._oMenu);
            }
            var oButton = this.byId("btnGenerate");
            this._oMenu.openBy(oButton);
        },

        onMenuAction: function(oEvent) {
            MessageToast.show("Revising text...");
            this._startGeneration(); 
        },

        // *** THIS IS THE UPDATED FUNCTION FOR AUTOMATIC EMAIL ***
        // UPDATED: Now includes CSRF Token fetching to fix 403 Forbidden Error
        onAISend: function() {
            var oModel = this.getView().getModel("appView");
            var sEmail = oModel.getProperty("/emailTo");
            var sSubject = oModel.getProperty("/emailTopic");
            var sBody = oModel.getProperty("/aiOutputText");

            // Validation
            if(!sEmail){
                MessageToast.show("Please enter a recipient email address.");
                return;
            }

            var oDialog = this.byId("aiDialog");
            oDialog.setBusy(true);

            // 1. GET CSRF TOKEN 
            // We ask the main OData model for the security token.
            // If it's available, we add it to the headers.
            var sToken = null;
            if (this.getView().getModel() && this.getView().getModel().getSecurityToken) {
                sToken = this.getView().getModel().getSecurityToken();
            }

            // 2. SEND AJAX WITH TOKEN
            jQuery.ajax({
                url: "/send-mail",
                type: "POST",
                contentType: "application/json",
                headers: {
                    "X-Csrf-Token": sToken // <--- Attaching the token here fixes the 403 error
                },
                data: JSON.stringify({
                    to: sEmail,
                    subject: sSubject,
                    text: sBody
                }),
                success: function() {
                    oDialog.setBusy(false);
                    MessageToast.show("Email sent successfully via system!");
                    oDialog.close();
                },
                error: function(oError) {
                    oDialog.setBusy(false);
                    var sMsg = "Unknown error";
                    if (oError.responseText) {
                        try {
                            // Try to parse JSON error if available
                            sMsg = JSON.parse(oError.responseText).error || oError.responseText;
                        } catch(e) {
                            sMsg = oError.responseText;
                        }
                    }
                    MessageBox.error("Failed to send email.\nReason: " + sMsg);
                }
            });
        },

        onAICancel: function() {
            this._stopGeneration();
            this.byId("aiDialog").close();
        },

        // ============================================================
        // PUSH LOGIC (Existing)
        // ============================================================

        onPushChanges: function() {
            var oTable = this.byId("lineItemsList");
            var aItems = oTable.getItems();
            var oModel = this.getView().getModel();
            var bChangeFound = false;

            aItems.forEach(function(oItem) {
                var oInput = oItem.getCells()[3];
                var sNewValue = oInput.getValue();
                var oContext = oItem.getBindingContext();
                if (!oContext) return;
                
                var sPath = oContext.getPath();
                var sOriginalValue = oContext.getProperty("OrderQuantity");

                if (parseFloat(sNewValue) !== parseFloat(sOriginalValue)) {
                    bChangeFound = true;
                    oModel.update(sPath, { OrderQuantity: sNewValue }, {
                        success: function() {
                            MessageToast.show("Update Successful!");
                            oModel.refresh(true); 
                        },
                        error: function(oError) {
                            var sErrorMsg = "Unknown Error";
                            try {
                                var oBody = JSON.parse(oError.responseText);
                                sErrorMsg = oBody.error.message.value;
                            } catch (e) {
                                sErrorMsg = oError.message || oError.statusText;
                            }
                            MessageBox.error("Failed to push update.\n\nReason: " + sErrorMsg);
                        }
                    });
                }
            });

            if (!bChangeFound) {
                MessageToast.show("No changes detected.");
            }
        },

        // ============================================================
        // STANDARD LOGIC
        // ============================================================

        onSelectionChange: function (oEvent) {
            var oItem = oEvent.getParameter("listItem") || oEvent.getSource();
            var sPath = oItem.getBindingContext().getPath();
            
            var oDetail = this.byId("detail");
            oDetail.bindElement({
                path: sPath,
                parameters: { expand: "to_PurchaseOrderItem" }
            });

            var oModel = this.getView().getModel("appView");
            if (oModel.getProperty("/masterSize") === "0px" || oModel.getProperty("/masterSize") === "100%") {
                 oModel.setProperty("/masterSize", "400px");
                 oModel.setProperty("/isFullScreen", false);
            }
        },

        onFullScreen: function () {
            this.getView().getModel("appView").setProperty("/masterSize", "0px");
            this.getView().getModel("appView").setProperty("/isFullScreen", true);
        },

        onExitFullScreen: function () {
            this.getView().getModel("appView").setProperty("/masterSize", "400px");
            this.getView().getModel("appView").setProperty("/isFullScreen", false);
        },

        onCloseDetail: function () {
            this.getView().getModel("appView").setProperty("/masterSize", "100%");
            this.getView().getModel("appView").setProperty("/isFullScreen", false);
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getSource().getValue();
            var aFilters = [];
            if (sQuery && sQuery.length > 0) {
                aFilters.push(new Filter("PurchaseOrder", FilterOperator.Contains, sQuery));
            }
            this.byId("list").getBinding("items").filter(aFilters);
        },
        
        onSort: function () {
            var oList = this.byId("list");
            var oBinding = oList.getBinding("items");
            var bDesc = oBinding.aSorters[0] ? !oBinding.aSorters[0].bDescending : false;
            oBinding.sort(new sap.ui.model.Sorter("PurchaseOrder", bDesc));
        }
    });
});