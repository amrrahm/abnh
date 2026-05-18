
var currentServer = null;
var currentServerId = null;
var gatewayServer = null;
var areApplicationIconsDisplayed = false;
var currentApplications = null;
var previousConnectionStatus = '';
var resizingDelay = null;
var currentZoom = null;
var isReallyClosing = false;

if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (suffix) {
        return this.indexOf(suffix, this.length - suffix.length) !== -1;
    };
}

if (!String.prototype.startsWith) {
    Object.defineProperty(String.prototype, 'startsWith', {
        value: function (search, pos) {
            return this.substring(!pos || pos < 0 ? 0 : +pos, search.length) === search;
        }
    });
}

var appNavigator = null;
var tsApp = {
//region Initialization
    onEverythingReady: function () {
        appNavigator = document.getElementById('appNavigator');
        appNavigator.pushPage('splitter.html');

        document.addEventListener('init', function (event) {
            var page = event.target;
            tsLanguage.translateHtmlForCurrentPage(page);
            switch (page.id) {
                case 'splitter': tsApp.initPageSplitter(page); break;
                case 'about': tsApp.initPageAbout(page); break;
                case 'settings': tsApp.initPageSettings(page); break;
                case 'home': tsApp.initPageHome(page); break;
                case 'server-form': tsApp.initPageServerForm(page); break;
                case 'applications': tsApp.initPageApplications(page); break;
                case 'client': tsApp.initPageClient(page); break;
                case 'verificationcode': tsApp.initPageVerificationCode(page); break;
            }
            console.log('init page ' + page.id);
        }, false);

        document.addEventListener('show', function (event) {
            var page = event.target;
            switch (page.id) {
                case 'home': tsApp.showPageHome(page); break;
                case 'verificationcode': tsApp.showPageVerificationCode(page); break;
                case 'applications': tsApp.openSession(gatewayServer); break;
            }
            console.log('show page ' + page.id);
        }, false);

        document.addEventListener('hide', function (event) {
            var page = event.target;
            console.log('hide page ' + page.id);
        }, false);

        document.addEventListener('destroy', function (event) {
            var page = event.target;
            console.log('destroy page ' + page.id);
        }, false);

        // Do not listen to "resize" on mobiles/tablet as it gets fired when native keyboard is shown, thus reloading the page wrongly
        if (window.device.platform == 'browser') {
            window.addEventListener('resize', tsApp.handleResizeAndOrientationChange, false);
        } else {
            window.addEventListener('orientationchange', tsApp.handleResizeAndOrientationChange, false);
        }
        if (device.platform == 'iOS') { // Prevents a bug on iOS when after printing the whole webview is positionned at top -20px
            document.addEventListener('resize', function (event) {
                StatusBar.overlaysWebView(true);
                StatusBar.overlaysWebView(false);
            });
        }

        if (window.device.platform == 'windows') { // Windows 10 app: remove back button on title bar
            var currentView = Windows.UI.Core.SystemNavigationManager.getForCurrentView();
            currentView.appViewBackButtonVisibility = Windows.UI.Core.AppViewBackButtonVisibility.collapsed;
        }

        if (window.device.platform == 'browser') {
            window.onbeforeunload = tsApp.handleBrowserClosing; // Do NOT use addEventListener() or it will not work. Interesting stuff.

            require('electron').ipcRenderer.on('tsapp-electron-print-done', function (event, arg) {
                $('#client-progressbar').hide();
            });
        }

        window.addEventListener('message', tsApp.onMessageReceived, false);

        if (!(window.device.platform == 'Android' && window.device.version < '4.4.4')) { // Toast stays displayed all the time in Android < 4.4.4
            document.addEventListener('offline', tsApp.refreshConnectionStatus, false);
            document.addEventListener('online', tsApp.refreshConnectionStatus, false);
        }
    },
    handleBrowserClosing: function (event) {
        // Only ask for confirmation before closing IF there is an open remote session
        if (appNavigator.pages[appNavigator.pages.length - 1].id == 'client') {
            // N.B.: This "confirm" is asynchronous, so it will set "isReallyClosing" after the event handler has finished
            // hence the "window.close()" to re-run the close handler
            ons.notification
                .confirm({
                    title: _('Are you sure?'),
                    message: _('You have an opened session.') + ' ' + _('Do you really want to exit this application?'),
                    buttonLabels: [_('Cancel'), _('OK')]
                })
                .then(function (isReallyOK) {
                    if (isReallyOK) {
                        isReallyClosing = true;
                        window.close();
                    }
                });
        } else {
            isReallyClosing = true;
        }

        if (isReallyClosing) {
            e.defaultPrevented = false; // Yes, I know. What is "e", where is it defined, and so on? Magic. Everywhere. Gotta love web browsers.
        }

        return false; // This will prevent all closes until "e.defaultPrevented" is set to false.
    },
    refreshConnectionStatus: function () {
        var networkState = navigator.connection.type;
        var states = {};
        states[Connection.UNKNOWN] = ''; //_('Unknown connection');
        states[Connection.ETHERNET] = _('Ethernet connection');
        states[Connection.WIFI] = _('WiFi connection');
        states[Connection.CELL_2G] = _('Cell 2G connection');
        states[Connection.CELL_3G] = _('Cell 3G connection');
        states[Connection.CELL_4G] = _('Cell 4G connection');
        states[Connection.CELL] = _('Cell generic connection');
        states[Connection.NONE] = _('No network connection');

        var newConnectionStatus = states[networkState];
        if (newConnectionStatus != '' && newConnectionStatus != previousConnectionStatus) {
            ons.notification.toast({ message: newConnectionStatus, timeout: 2000 });
        }
        previousConnectionStatus = newConnectionStatus;
    },
//endregion
//region Server object and persistance
    serversRead: function () {
        var servers = JSON.parse(localStorage.getItem('servers'));
        if (servers == null) {
            servers = [];
        }
        return servers;
    },
    serversWrite: function (servers) {
        localStorage.setItem('servers', JSON.stringify(servers));
    },
    getServerDisplayName: function (server) {
        var displayName = server.displayname;
        if (displayName == null || displayName == '') {
            displayName = server.hostname;
        }
        return displayName;
    },
    getServerDisplayNameInternal: function (server) {
        var displayName = server.displayname;
        if (displayName == null) {
            displayName = '';
        }
        return displayName;
    },
    getUserLogin: function (server) {
        var usersplit = server.user.split('\\');
        var login = usersplit[0];
        if (usersplit.length == 2) {
            login = usersplit[1];
        }
        return login;
    },
    getUserDomain: function (server) {
        var usersplit = server.user.split('\\');
        var domain = '';
        if (usersplit.length == 2) {
            domain = usersplit[0];
        }
        return domain;
    },
    isValidIPAddress: function (ipaddress) {
        return (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\:?([0-9]+)?$/.test(ipaddress));
    },
    getServerProtocolToUse: function (server) {
        var protocol = server.protocol;
        if (tsApp.isValidIPAddress(server.hostname) && window.device.platform != 'browser') { // Electron apps accept invalid certificates due to our handling of 'certificate-error' in main.js
            protocol = 'http'; // Cannot have a valid certificate for an IP address, so we force HTTP on mobile apps (and hope the server does not redirect us to HTTPS)
        }
        return protocol;
    },
//endregion
//region Settings persistance
    settingRead: function (name) {
        var settings = JSON.parse(localStorage.getItem('settings'));
        if (settings == null || settings[name] == null) {
            return tsApp.settingGetDefaultValue(name);
        }
        return settings[name];
    },
    settingReadNoDefaultValue: function (name) {
        var settings = JSON.parse(localStorage.getItem('settings'));
        if (settings == null || settings[name] == null) {
            return null;
        }
        return settings[name];
    },
    settingGetDefaultValue: function (name) {
        var value = null;
        switch (name) {
            case 'language':
                value = tsLanguage.language;
                break;
            case 'zoom':
                value = '0.5';
                if ($(window).width() + $(window).height() >= 1280) { // iPad=768*1024, A5=360*640, PC=1920*694
                    value = '1';
                }
                break;
            case 'slownetwork':
                value = false;
                break;
            case 'mousesize':
                value = '1.3';
                break;
            case 'hidesettingicon':
                value = false;
                break;
            case 'hidebasketicon':
                value = false;
                break;
            default:
                console.log('Unknown setting "' + name + '"');
        }
        return value;
    },
    settingWrite: function (name, value) {
        var settings = JSON.parse(localStorage.getItem('settings'));
        if (settings == null) {
            settings = {};
        }
        settings[name] = value;
        localStorage.setItem('settings', JSON.stringify(settings));
    },
//endregion
//region Splitter
    initPageSplitter: function (page) {
        document.querySelector('#appSplitter').left.setAttribute('animation', ons.platform.isAndroid() ? 'overlay' : 'reveal');
    },
    splitterMenuLoad: function (pageName) {
        var content = document.getElementById('appSplitterContent');
        var menu = document.getElementById('appSplitterMenu');
        content
            .load(pageName)
            .then(menu.close.bind(menu));
    },
//endregion
//region About
    initPageAbout: function (page) {
        page.querySelector('#appVersion').innerHTML = appVersion;
        page.querySelector('#buttonMenuAboutPage').onclick = function () {
            document.querySelector('#appSplitter').left.toggle();
        };
    },
//endregion
//region Settings
    initPageSettings: function (page) {
        page.querySelector('#buttonMenuSettingsPage').onclick = function () {
            document.querySelector('#appSplitter').left.toggle();
        };

        if (window.device.platform == 'browser') {
            $(page.querySelectorAll('.hideOnComputers')).hide();
        }

        $('#settings-form-language').val(tsApp.settingRead('language'));
        $('#settings-form-zoom').val(tsApp.settingRead('zoom'));
        $('#settings-form-slownetwork').prop('checked', tsApp.settingRead('slownetwork'));
        $('#settings-form-mousesize').val(tsApp.settingRead('mousesize'));

        $('#settings-form-hide-setting').prop('checked', tsApp.settingRead('hidesettingicon'));
        $('#settings-form-hide-basket').prop('checked', tsApp.settingRead('hidebasketicon'));

        $('#settings-form-language').on('change', function () {
            tsApp.settingWrite('language', $('#settings-form-language').val());
            tsLanguage.setLanguage(tsApp.settingRead('language'));
            tsLanguage.translateHtmlForCurrentPage(document.querySelector('#appSplitter').left); // Translate splitter menu
            tsLanguage.translateHtmlForCurrentPage(document.getElementById('appSplitterContent')); // Translate settings page
        });
        $('#settings-form-zoom').on('change', function () {
            tsApp.settingWrite('zoom', $('#settings-form-zoom').val());
        });
        $('#settings-form-slownetwork').on('change', function () {
            tsApp.settingWrite('slownetwork', $('#settings-form-slownetwork').prop('checked'));
        });

        $('#settings-form-mousesize').on('change', function () {
            tsApp.settingWrite('mousesize', $('#settings-form-mousesize').val());
        });

        $('#settings-form-hide-setting').on('change', function () {
            tsApp.settingWrite('hidesettingicon', $('#settings-form-hide-setting').prop('checked'));
        });

        $('#settings-form-hide-basket').on('change', function () {
            tsApp.settingWrite('hidebasketicon', $('#settings-form-hide-basket').prop('checked'));
        });
    },
//endregion
//region Home
    initPageHome: function (page) {
        page.querySelector('#buttonMenuHomePage').onclick = function () {
            document.querySelector('#appSplitter').left.toggle();
        };
        Array.prototype.forEach.call(page.querySelectorAll('[component="button/new-server"]'), function (element) {
            element.onclick = function () {
                appNavigator.pushPage('server-form.html', {
                    data: { serverId: null }
                });
            };
        });
    },
    showPageHome: function (page) {
        var servers = this.serversRead();
        this.refreshServersList(servers);
    },
    makeCallbackServerLaunchOnClick: function (serverId) {
        // Yes I am aware of the "let" keyword instead of "var" for this case, but it does not work in "old" iOS such as iOS 8-9...
        return function () {
            appNavigator.pushPage('verificationcode.html', {
                data: { serverId: serverId }
            });
        };
    },
    makeCallbackServerEditOnClick: function (serverId) {
        // Yes I am aware of the "let" keyword instead of "var" for this case, but it does not work in "old" iOS such as iOS 8-9...
        return function (e) {
            e.stopPropagation();
            appNavigator.pushPage('server-form.html', {
                data: { serverId: serverId }
            });
        };
    },
    makeCallbackServerDeleteOnClick: function (serverId) {
        // Yes I am aware of the "let" keyword instead of "var" for this case, but it does not work in "old" iOS such as iOS 8-9...
        return function (e) {
            e.stopPropagation();
            var servers = tsApp.serversRead();
            ons.notification
                .confirm({
                    title: _('Are you sure?'),
                    message: _('Do you really want to remove "###SERVERNAME###" from your TSplus servers list?').replace('###SERVERNAME###', tsApp.getServerDisplayName(servers[serverId])),
                    buttonLabels: [_('Cancel'), _('OK')]
                })
                .then(function (isReallyOK) {
                    if (isReallyOK) {
                        var updatedServers = [];
                        for (var i = 0, len = servers.length; i < len; i++) {
                            if (i != serverId) {
                                updatedServers.push(servers[i]);
                            }
                        }

                        tsApp.serversWrite(updatedServers);

                        appNavigator.resetToPage('splitter.html');
                    }
                });
        };
    },
    refreshServersList: function (servers) {
        if (servers.length == 0) {
            $('#servers-empty').show();
            $('#servers-list').hide();
        } else {
            $('#servers-empty').hide();
            $('#servers-list').show();

            var serversList = $("#servers-list");
            serversList.html('');
            for (var i = 0, len = servers.length; i < len; i++) {
                var listItem = ons.createElement('<ons-list-item tappable modifier="longdivider">' +
                    '<div class="center">' + tsApp.getServerDisplayName(servers[i]) + '</div>' +
                    '<div class="right actionicons">' +
                    '<ons-icon class="server-edit" icon="ion-ios-settings, material:md-settings" modifier="material" style="padding: 0px 10px 0px 10px;"></ons-icon>' +
                    '<ons-icon class="server-delete" icon="ion-ios-trash-outline, material:md-delete" modifier="material" style="padding: 0px 10px 0px 10px;"></ons-icon>' +
                    '</div>' +
                    '</ons-list-item>');

                listItem.querySelector('.center').onclick = tsApp.makeCallbackServerLaunchOnClick(i);
                listItem.querySelector('.server-edit').onclick = tsApp.makeCallbackServerEditOnClick(i);
                listItem.querySelector('.server-delete').onclick = tsApp.makeCallbackServerDeleteOnClick(i);

                if(tsApp.settingRead("hidesettingicon")) {
                    listItem.querySelector('.server-edit').style.display = 'none';
                }

                if(tsApp.settingRead("hidebasketicon")) {
                    listItem.querySelector('.server-delete').style.display = 'none';
                }
                serversList.append(listItem);
            }
        }
    },
//endregion
//region Server Form
    initPageServerForm: function (page) {
        currentServerId = appNavigator.topPage.data.serverId;

        if (currentServerId == null) {
            $('#server-form-title').html(_('Add TSplus server'));

            $('#server-form-hostname').val('');
            $('#server-form-protocol').prop('checked', false);
            $('#server-form-displayname').val('');
            $('#server-form-user').val('');
            $('#server-form-password').val('');
            $('#server-form-ask-password').prop('checked', false);
        } else {
            var servers = this.serversRead();
            var server = servers[currentServerId];

            $('#server-form-title').html(_('Edit TSplus server'));

            $('#server-form-hostname').val(server.hostname);
            $('#server-form-protocol').prop('checked', (tsApp.getServerProtocolToUse(server) == 'https'));
            $('#server-form-displayname').val(this.getServerDisplayNameInternal(server));
            $('#server-form-user').val(server.user);
            $('#server-form-password').val(server.password);
            $('#server-form-ask-password').prop('checked', server.askpassword);

            if ($('#server-form-ask-password').prop('checked')) {
                $('#server-form-password').prop('disabled', true);
            }
            else {
                $('#server-form-password').prop('disabled', false);
            }
        }

        Array.prototype.forEach.call($('#server-form-ask-password'), function (element) {
            element.onclick = function () {
                if ($('#server-form-ask-password').prop('checked')) {
                    $('#server-form-password').prop('disabled', true);
                    $('#server-form-password').val('');
                }
                else {
                    $('#server-form-password').prop('disabled', false);
                }
            };
        });

        Array.prototype.forEach.call(page.querySelectorAll('[component="button/save"]'), function (element) {
            element.onclick = function () {
                // Validating
                $('#server-form-hostname').val($.trim($('#server-form-hostname').val()));
                if ($('#server-form-hostname').val() == '') {
                    ons.notification.alert({ title: _('Warning'), message: _('Please enter your server\'s IP address or domain name.'), buttonLabels: [_('OK')] });
                    return;
                }
                if ($('#server-form-hostname').val().length < 7) {
                    ons.notification.alert({ title: _('Warning'), message: _('Please enter at least 7 characters for your server\'s IP address or domain name.'), buttonLabels: [_('OK')] });
                    return;
                }
                if ($('#server-form-hostname').val().indexOf('http://') === 0 || $('#server-form-hostname').val().indexOf('https://') === 0) {
                    ons.notification.alert({ title: _('Warning'), message: _('Please enter only your server\'s hostname (no "http://" or "https://" prefix).'), buttonLabels: [_('OK')] });
                    return;
                }
                if ($('#server-form-user').val() == '') {
                    ons.notification.alert({ title: _('Warning'), message: _('Please enter your username (domain is optional).'), buttonLabels: [_('OK')] });
                    return;
                }
                
                // To remove if we consider web credential with empty password
                if ($('#server-form-password').val() == '' && !($('#server-form-ask-password').prop('checked'))) {
                    ons.notification.alert({ title: _('Warning'), message: _('Please enter your password.'), buttonLabels: [_('OK')] });
                    return;
                }

                // Saving server
                var server = {
                    hostname: $('#server-form-hostname').val(),
                    protocol: $('#server-form-protocol').prop('checked') ? 'https' : 'http',
                    displayname: $('#server-form-displayname').val(),
                    user: $('#server-form-user').val(),
                    password: $('#server-form-password').val(),
                    askpassword: $('#server-form-ask-password').prop('checked')
                };

                var servers = tsApp.serversRead();

                if (currentServerId == null) { // Add new server
                    servers.push(server);
                } else { // Edit existing server
                    servers[currentServerId] = server;
                }

                tsApp.serversWrite(servers);

                // Going back to the Home page
                appNavigator.popPage();
            };
        });
    },
//endregion
//region Assigned Applications
    initPageApplications: function (page) {
        currentServerId = appNavigator.topPage.data.serverId;

        var servers = this.serversRead();
        gatewayServer = servers[currentServerId];

        if (appNavigator.topPage.data.askPassword) {
            gatewayServer.password = appNavigator.topPage.data.passwordTyped;
        }
        
        var targetServer = $.extend(true, {}, gatewayServer);

        $('#applications-title').html(tsApp.getServerDisplayName(gatewayServer));
        this.applicationsDisplayMessage(_('Loading your applications...'), true);

        if (appNavigator.topPage.data.serverhostname !== '') {
            targetServer.hostname = appNavigator.topPage.data.serverhostname;
        }

        currentServer = targetServer;
    },
    openSession: function(gatewayServer) {
        var twoFactorCode = appNavigator.topPage.data.code;

        areApplicationIconsDisplayed = false;

        // Assigned Applications
        $.get(
            tsApp.getServerProtocolToUse(gatewayServer) + '://' + gatewayServer.hostname + '/cgi-bin/hb.exe',
            {
                'action': 'mobileassigned',
                'l': tsApp.getUserLogin(gatewayServer),
                'd': tsApp.getUserDomain(gatewayServer),
                'p': gatewayServer.password,
                'f': twoFactorCode,
                's': '127.0.0.1',
                't': new Date().getTime()
            },
            function (data) {
                if (data == '[]') {
                    // No application assigned to user => automatically connect to the server
                    appNavigator.pushPage('client.html', {
                        data: { applicationId: null }
                    });
                } else if (data.indexOf('[{"') !== 0) {
                    tsApp.applicationsDisplayMessage(
                        '<div style="text-align:left;">' +
                        _('Thank you for using TSplus app.') + '<br>' + _('The server you are trying to connect to is not responding.') + '<br><br>' +
                        _('Requirements to connect are:') + '<ul><li>' + _('TSplus or any compatible product') + '</li><li>' + _('Web Mobile or Enterprise edition') +
                        '</li><li>' + _('Release 11.20 and over') + '</li><li>' + _('Started Web server using the specified port number') +
                        '</li><li>' + _('Valid credentials') + '</li></ul>' + _('Please contact your Administrator.') + '</div>', false
                    );
                } else {
                    var appsData = eval(data);
                    if (appsData.length == 0) {
                        tsApp.applicationsDisplayMessage(
                            _('No application is currently assigned to you, or the logon typed is invalid.') +
                            '<br><br>' + _('Please contact your Administrator.'), false
                        );
                    } else if (appsData.length == 1 && appsData[0].ErrorMessage) {
                        tsApp.applicationsDisplayMessage(_(appsData[0].ErrorMessage), false);
                    } else {
                        currentApplications = appsData;

                        // If only 1 application is assigned to user => automatically connect to the server with this application
                        if (appsData.length == 1) {
                            appNavigator.pushPage('client.html', {
                                data: { applicationId: 0 }
                            });
                        } else {
                            // If Desktop/FloatingPanel/TaskBar/AppPanel is assigned to user => automatically connect to the server with this application (AppPanel in priority)
                            var iDesktop = -1;
                            var iFloatingPanel = -1;
                            var iTaskBar = -1;
                            var iApplicationPanel = -1;
                            for (var i = 0; i < appsData.length; i++) {
                                if (appsData[i].ApplicationPath.endsWith('UserDesktop\\\\\\\\\\\\\\\\files\\\\\\\\\\\\\\\\desktop.exe')) {
                                    iDesktop = i;
                                }
                                if (appsData[i].ApplicationPath.endsWith('UserDesktop\\\\\\\\\\\\\\\\files\\\\\\\\\\\\\\\\taskbar.exe')) {
                                    iFloatingPanel = i;
                                }
                                if (appsData[i].ApplicationPath.endsWith('UserDesktop\\\\\\\\\\\\\\\\files\\\\\\\\\\\\\\\\floatingpanel.exe')) {
                                    iTaskBar = i;
                                }
                                if (appsData[i].ApplicationPath.endsWith('UserDesktop\\\\\\\\\\\\\\\\ApplicationPanel.exe')) {
                                    iApplicationPanel = i;
                                }
                            }
                            if (iApplicationPanel > -1) {
                                appNavigator.pushPage('client.html', {
                                    data: { applicationId: iApplicationPanel }
                                });
                            } else if (iFloatingPanel > -1) {
                                appNavigator.pushPage('client.html', {
                                    data: { applicationId: iFloatingPanel }
                                });
                            } else if (iTaskBar > -1) {
                                appNavigator.pushPage('client.html', {
                                    data: { applicationId: iTaskBar }
                                });
                            } else if (iDesktop > -1) {
                                appNavigator.pushPage('client.html', {
                                    data: { applicationId: null }
                                });
                            } else {
                                // Applications Icons
                                areApplicationIconsDisplayed = true;
                                tsApp.displayFolder('');
                            }
                        }
                    }
                }
            });
    },
    displayFolder: function(folderName) {
        $('#applications-list').html('');

        var folders = [];

        var j = 0;
        var row = null;
        if (folderName != '') { // SUB-folder: display "parent" icon
            row = tsApp.displayApplication(j, row, tsApp.makeCallbackFolderOnClick(''), 'arrow_up.ico', '..');
            j++;
        }

        var a = 0;
        for (a = 0; a < currentApplications.length; a++) {
            var appNameClean = currentApplications[a].ApplicationName.replace(/\\\"/g, "\""); // replace all \" by "

            if (currentApplications[a].ApplicationFolder == folderName) {
                row = tsApp.displayApplication(j, row, tsApp.makeCallbackApplicationOnClick(a), currentApplications[a].ApplicationIcon, appNameClean);
                j++;
            } else {
                if (folderName == '' && $.inArray(currentApplications[a].ApplicationFolder, folders) < 0) { // ROOT folder: display folder icon (if not already done)
                    folders.push(currentApplications[a].ApplicationFolder);
                    row = tsApp.displayApplication(j, row, tsApp.makeCallbackFolderOnClick(currentApplications[a].ApplicationFolder), 'folder_table.ico', currentApplications[a].ApplicationFolder);
                    j++;
                }
            }
        }
        for (i = j % 4; i > 0 && i < 4; i++) {
            $(row).append(ons.createElement('<ons-col class="app"> </ons-col>'));
        }

        tsApp.applicationsHideMessage();
    },
    displayApplication: function (j, row, clickHandler, icon, text) {
        if (j % 4 == 0) {
            row = ons.createElement('<ons-row></ons-row>');
            $('#applications-list').append(row);
        }

        var listItem = ons.createElement('<ons-col class="app">' +
            '<a href="#">' +
            '<img src="' + tsApp.getServerProtocolToUse(currentServer) + '://' + currentServer.hostname + '/software/html5/imgs/topmenu/' + icon + '" alt="' + text + '">' +
            '<br><span>' + _(text) + '</span>' +
            '</a>' +
            '</ons-col>');

        listItem.querySelector('a').onclick = clickHandler;

        $(row).append(listItem);

        return row;
    },
    makeCallbackFolderOnClick: function (folderName) {
        return function () {
            tsApp.displayFolder(folderName);
        };
    },
    makeCallbackApplicationOnClick: function (applicationId) {
        // Yes I am aware of the "let" keyword instead of "var" for this case, but it does not work in "old" iOS such as iOS 8-9...
        return function () {
            appNavigator.pushPage('client.html', {
                data: { applicationId: applicationId }
            });
        };
    },
    applicationsDisplayMessage: function (message, showProgessBar) {
        $('#applications-list').hide();
        $('#applications-message').html(message);
        $('#applications-message').show();
        if (showProgessBar) {
            $('#applications-progressbar').show();
        } else {
            $('#applications-progressbar').hide();
        }
    },
    applicationsHideMessage: function () {
        $('#applications-message').hide();
        $('#applications-progressbar').hide();
        $('#applications-list').show();
    },
//endregion
//region Connection Client
    jsencode64: function (input) {
        var jsb64array = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var base64 = "";
        var hex = "";
        var chr1, chr2, chr3 = "";
        var enc1, enc2, enc3, enc4 = "";
        var i = 0;
        do {
            chr1 = input.charCodeAt(i++);
            chr2 = input.charCodeAt(i++);
            chr3 = input.charCodeAt(i++);
            enc1 = chr1 >> 2;
            enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
            enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
            enc4 = chr3 & 63;
            if (isNaN(chr2)) {
                enc3 = enc4 = 64;
            } else if (isNaN(chr3)) {
                enc4 = 64;
            }
            base64 = base64 +
                jsb64array.charAt(enc1) +
                jsb64array.charAt(enc2) +
                jsb64array.charAt(enc3) +
                jsb64array.charAt(enc4);
            chr1 = chr2 = chr3 = "";
            enc1 = enc2 = enc3 = enc4 = "";
        } while (i < input.length);
        return base64;
    },
    initPageClient: function (page) {
        var applicationId = appNavigator.topPage.data.applicationId;

        var server = currentServer;

        $('#client-progressbar').hide();

        // User and Settings
        var clientUrl = tsApp.getServerProtocolToUse(server) + '://' + server.hostname + '/software/html5.html';

        var clientSettings = "var randomnum = " + Math.floor(Math.random() * 1000) + "; ";

        clientSettings += "window.user='" + this.getUserLogin(server) + "';";
        clientSettings += "window.pass='" + server.password + "';";
        clientSettings += "window.domain='" + this.getUserDomain(server) + "';";
        clientSettings += "window.goToLinkOnClose='../mobilelogoff.html';";
        clientSettings += "window.gooutofiframe=false;";
        clientSettings += "window.forcePcResize=2;";
        clientSettings += "window.imgmenuresize=true;";
        clientSettings += "window.reroutePrinterLinks=new Object();";
        clientSettings += "window.reroutePrinterLinks.enabled=true;";
        clientSettings += "window.showfullscreenbutton='no';"; // Fullscreen fails in Electron
        clientSettings += "window.filehtmluploadbutton='no';"; // Upload fails on all devices

        if (tsApp.settingRead('slownetwork')) {
            clientSettings += "window.lefttopasmiddlepoint=true;";
            clientSettings += "window.theming_level=0;";
            clientSettings += "window.timeoutDownMove=10;";
            clientSettings += "window.default_color='16:16';";
        }

        // Only for mobiles/tablets: zoom buttons and mouse pointer size
        if (window.device.platform != 'browser') {
            clientSettings += "window.showZoomIframeButtons=new Object();";
            clientSettings += "window.showZoomIframeButtons.in=true;";
            clientSettings += "window.showZoomIframeButtons.out=true;";
            clientSettings += "window.showZoomIframeButtons.force=true;";
            clientSettings += "window.imgtomenuratio=" + tsApp.settingRead('mousesize') + ";";
        }

        // Application
        if (applicationId != null && currentApplications != null && currentApplications.length > applicationId) {
            var application = currentApplications[applicationId];

            var apppath = application.ApplicationPath;
            var appstartup = application.ApplicationStartup;
            var appcmdline = application.ApplicationCmdline;
            if (appcmdline.indexOf("\"", this.length - 1) !== -1) { // appcmdline ends with a " => we double it (\") to get it back on server side
                appcmdline += "\\\"";
            }

            clientSettings += ("window.cmdline='" + apppath + "|" + appstartup + "|" + appcmdline + "';").replace(/\\\\\\\\/g, '\\\\');
        }

        var clientName = this.jsencode64(escape(clientSettings)).replace(/=/g, '_');

        // Zoom level
        currentZoom = this.settingRead('zoom');
        var zoomSize = 100 / currentZoom;
        var zoomOffset = (100 - zoomSize) / 2;

        // Iframe
        var clientIframe = '<iframe id="client-iframe" width="' + zoomSize + '%" height="' + zoomSize + '%" frameborder="0" scrolling="no"' +
            ' webkitAllowFullScreen="webkitAllowFullScreen" allowFullScreen="allowFullScreen"' +
            ' style="width:' + zoomSize + '%; height:' + zoomSize + '%; overflow:hidden; position:absolute;' +
            ' left:' + zoomOffset + '%; top:' + zoomOffset + '%; transform:scale(' + currentZoom + ');"' +
            ' src="' + clientUrl + '"' +
            ' name="' + clientName + '"></iframe>';
        $('#client-iframe-div').append(clientIframe);
    },
    handleResizeAndOrientationChange: function () {
        if (resizingDelay != null) {
            clearTimeout(resizingDelay);
        }
        resizingDelay = setTimeout(function () {
            tsApp.refreshIframe();
        }, 500);
    },
    onMessageReceived: function (message) {
        switch (message.data) {
            case 'mobilelogoff': tsApp.disconnect(); break;
            case 'html5-zoom-in': tsApp.zoomIn(); break;
            case 'html5-zoom-out': tsApp.zoomOut(); break;
            default:
                if (message.data.substr(0, "downloadprintPSPDF".length) == "downloadprintPSPDF" || message.data.substr(0, "downloadprintB64".length) == "downloadprintB64") {
                    tsApp.print(message.data.substr(message.data.indexOf(':') + 3));
                }
        }
    },
    print: function (documentUrl) {
        if (window.device.platform == 'browser') {
            $('#client-progressbar').show();
            require('electron').ipcRenderer.send('tsapp-electron-print', documentUrl);
        } else {
            $('#client-progressbar').show();
            window.requestFileSystem(window.TEMPORARY, 100 * 1024 * 1024, function (cfs) {
                console.log(cfs);
                // Parameters passed to getFile create a new file or return the file if it already exists.
                cfs.root.getFile('print_' + Date.now() + '.pdf', { create: true, exclusive: false }, function (fileEntry) {
                    var fileTransfer = new FileTransfer();
                    var fileURL = fileEntry.toURL();
                    fileTransfer.download(
                        documentUrl,
                        fileURL,
                        function (entry) {
                            console.log("download complete: " + entry.toURL());
                            cordova.plugins.fileOpener2.open(
                                entry.toURL(),
                                'application/pdf',
                                {
                                    success: function () {
                                        $('#client-progressbar').hide();
                                    },
                                    error: function (e) {
                                        console.log('FileOpener Error!');
                                        console.log(e);
                                        $('#client-progressbar').hide();
                                    }
                                }
                            );
                        },
                        function (error) {
                            console.log("download error source " + error.source);
                            console.log("download error target " + error.target);
                            console.log("upload error code" + error.code);
                            $('#client-progressbar').hide();
                        },
                        true // trustAllHosts
                    );
                }, function (e) {
                    $('#client-progressbar').hide();
                });
            }, function (e) {
                $('#client-progressbar').hide();
            });
        }
    },
    zoomIn: function () {
        currentZoom = currentZoom * 2;
        if (currentZoom > 1) {
            currentZoom = 1;
        }
        else {
            tsApp.zoomApply();
        }
    },
    zoomOut: function () {
        currentZoom = currentZoom / 2;
        if (currentZoom < 1 / 2 / 2) {
            currentZoom = 1 / 2 / 2;
        } else {
            tsApp.zoomApply();
        }
    },
    zoomApply: function () {
        var zoomSize = 100 / currentZoom;
        var zoomOffset = (100 - zoomSize) / 2;
        $('#client-iframe').css({
            transform: 'scale(' + currentZoom + ')',
            width: zoomSize + '%',
            height: zoomSize + '%',
            left: zoomOffset + '%',
            top: zoomOffset + '%'
        });
        tsApp.refreshIframe();
    },
    refreshIframe: function () {
        var iframes = $('iframe');
        if (iframes.length > 0) {
            // Refresh iframe (cannot use location.reload() due to cross-domain security restrictions)
            $('iframe')[0].src = $('iframe')[0].src + '?splashscreencontent=&connectionmessage=false';
        }
    },
    disconnect: function () {
        if (areApplicationIconsDisplayed) {
            // Going back to the Applications page
            appNavigator.popPage();
        } else {
            // No application icons displayed on the Applications page => going back to the servers list
            appNavigator.resetToPage('splitter.html');
        }
        $('#client-iframe-div').html('');
    },
//endregion
//region Verification code
    initPageVerificationCode: function (page) {
        var serverId = appNavigator.topPage.data.serverId;
        $('#verificationpassword-form-code').val('');

        Array.prototype.forEach.call($('#send-sms-button'), function (element) {
            element.onclick = function () {
                tsApp.sendSMSFor2FA();
            };
        });

        Array.prototype.forEach.call(page.querySelectorAll('[component="button/save"]'), function (element) {
            element.onclick = function () {
                tsApp.connect();
            };
        });        
    },
    showPageVerificationCode: function (page) {
        var serverId = appNavigator.topPage.data.serverId;
        var servers = tsApp.serversRead();
        var server = servers[serverId];

        appNavigator.topPage.data.server = server;

        // To make it backward-compatible with saved servers in previous versions of mobile app
        if (server.askpassword == undefined) {
            server.askpassword = false;
        }
        appNavigator.topPage.data.askpassword = server.askpassword;
        appNavigator.topPage.data.serverhostname = '';

        $('#verificationcode-title').html(tsApp.getServerDisplayName(server));

        // Check if we're on 2FA mode
        $.post(
            tsApp.getServerProtocolToUse(server) + '://' + server.hostname + '/cgi-bin/hb.exe',
            {
                'action': 'twofa',
                'l': tsApp.getUserLogin(server),
                'd': tsApp.getUserDomain(server),
                't': new Date().getTime()
            },
            function (status) {
                switch (status) {
                    // Backward compatibility
                    case "activated":
                    case "activated-app":
                        appNavigator.topPage.data.twofa = true;
                        appNavigator.topPage.data.twofamode = "app";
                        break;
                    case "activated-sms":
                        appNavigator.topPage.data.twofa = true;
                        appNavigator.topPage.data.twofamode = "sms";
                        break;
                    case "not-activated":
                    case "not-activated-apponly":
                        tsApp.verificationCodeDisplayMessage(
                            _('Please connect with a Web browser to activate two-factor authentication for your account.'),
                            false);
                        break;
                    case "ko":
                        tsApp.verificationCodeDisplayMessage(
                            _('An error occured. Please retry later or contact your IT administrator.'),
                            false);
                        break;
                    default:
                        appNavigator.topPage.data.twofa = false;
                }
                tsApp.verificationCodeHideMessage();
                tsApp.launchDefaultCase();
            })
            .fail(function () {
                tsApp.verificationCodeDisplayMessage(
                    '<div style="text-align:left;">' + _('Unable to connect to the server.') + '<br><ul><li>' + _('Is your server hostname/port correct?') + '</li><li>' +
                    _('Is your server currently accessible from your device?') + '</li><li>' +
                    _('Is your server forcing the use of HTTPS with an invalid certificate?') + '</li><li>' +
                    _('TSplus app can only connect to TSplus servers, is TSplus installed on your server?') + '</li><li>' +
                    _('TSplus app requires TSplus Mobile Web or Enterprise edition.') + '</li></ul>' +
                    _('Please contact us if you want to purchase and/or upgrade TSplus on your server.') + '</div>', false);
            });

        // Check if we're on server assigned mode
        $.post(
            tsApp.getServerProtocolToUse(server) + '://' + server.hostname + '/cgi-bin/hb.exe',
            {
                'action': 'srvassigned',
                'l': tsApp.getUserLogin(server),
                'd': tsApp.getUserDomain(server),
                't': new Date().getTime()
            },
            function (data, textStatus, jqXHR) {
                if (data !== 'KO') {
                    appNavigator.topPage.data.assignedServers = data.split("\r\n").filter(function(el) { return el; });
                }
                else {
                    appNavigator.topPage.data.assignedServers = [];
                }
                tsApp.verificationCodeHideMessage();
                tsApp.launchDefaultCase();
            }).fail(function () {
                tsApp.verificationCodeDisplayMessage(
                    '<div style="text-align:left;">' + _('Unable to connect to the server.') + '<br><ul><li>' + _('Is your server hostname/port correct?') + '</li><li>' +
                    _('Is your server currently accessible from your device?') + '</li><li>' +
                    _('Is your server forcing the use of HTTPS with an invalid certificate?') + '</li><li>' +
                    _('TSplus app can only connect to TSplus servers, is TSplus installed on your server?') + '</li><li>' +
                    _('TSplus app requires TSplus Mobile Web or Enterprise edition.') + '</li></ul>' +
                    _('Please contact us if you want to purchase and/or upgrade TSplus on your server.') + '</div>', false);
            });

        // Check if we're on load-balancing mode
        $.post(
            tsApp.getServerProtocolToUse(server) + '://' + server.hostname + '/cgi-bin/hb.exe',
            {
                'action': 'lb',
                'l': tsApp.getUserLogin(server),
                'd': tsApp.getUserDomain(server),
                't': new Date().getTime()
            },
            function (data, textStatus, jqXHR) {
                if (data != "loadbalancing-off") {
                    appNavigator.topPage.data.loadbalancing = 'on';
                    var s = data.split("|");
                    var lessLoadedServerName = s[1];
                    var lessLoadedServerAddress = s[2]; // if loadbalanced and reverse-proxy => ip/~~srvX
                    var lessLoadedServerPort = s[4]; // May be empty
                    var serverHostName = '';
                    if (lessLoadedServerPort == '') {
                        serverHostName = lessLoadedServerAddress;
                    } 
                    else {
                        var splitGateway = lessLoadedServerAddress.split('/~~');
                        if (splitGateway.length == 2) {
                            serverHostName = splitGateway[0] + ':' + lessLoadedServerPort + '/~~' + splitGateway[1];
                        } 
                        else {
                            serverHostName = lessLoadedServerAddress + ':' + lessLoadedServerPort;
                        }
                    }
                    appNavigator.topPage.data.serverhostname = serverHostName;
                }
                else {
                    appNavigator.topPage.data.loadbalancing = 'off';
                }
                tsApp.verificationCodeHideMessage();
                tsApp.launchDefaultCase();
            })
            .fail(function () {
                tsApp.applicationsDisplayMessage(
                    '<div style="text-align:left;">' + _('Unable to connect to the server.') + '<br><ul><li>' + _('Is your server hostname/port correct?') + '</li><li>' +
                    _('Is your server currently accessible from your device?') + '</li><li>' +
                    _('Is your server forcing the use of HTTPS with an invalid certificate?') + '</li><li>' +
                    _('TSplus app can only connect to TSplus servers, is TSplus installed on your server?') + '</li><li>' +
                    _('TSplus app requires TSplus Mobile Web or Enterprise edition.') + '</li></ul>' +
                    _('Please contact us if you want to purchase and/or upgrade TSplus on your server.') + '</div>', false
                );
            });
    },
    launchDefaultCase: function () {
        if (appNavigator.topPage.data.twofa == undefined || 
            appNavigator.topPage.data.assignedServers == undefined || 
            appNavigator.topPage.data.loadbalancing == undefined) {
            return;
        }

        if (appNavigator.topPage.data.assignedServers.length == 1) {
            appNavigator.topPage.data.serverhostname = appNavigator.topPage.data.assignedServers[0].split('|')[1];
        }

        if (appNavigator.topPage.data.twofa == false && appNavigator.topPage.data.askpassword == false && (appNavigator.topPage.data.assignedServers.length <= 1 || appNavigator.topPage.data.loadbalancing == 'on')) {
            appNavigator.pushPage('applications.html', {
                data: {
                    serverId: appNavigator.topPage.data.serverId,
                    code: '',
                    askPassword: false,
                    serverhostname: appNavigator.topPage.data.serverhostname
                }
            });
        }
    },
    sendSMSFor2FA: function () {
        if (appNavigator.topPage.data.askpassword) {
            appNavigator.topPage.data.server.password = $('#verificationpassword-form-code').val();
        }

        $.post(
            tsApp.getServerProtocolToUse(appNavigator.topPage.data.server) + '://' + appNavigator.topPage.data.server.hostname + '/cgi-bin/hb.exe',
            {
                'action': 'twofa',
                'l': tsApp.getUserLogin(appNavigator.topPage.data.server),
                'd': tsApp.getUserDomain(appNavigator.topPage.data.server),
                'p': appNavigator.topPage.data.server.password,
                'n': ""
            },
            function (data) {
                switch (data) {
                    case "disabled":
                        ons.notification.alert({
                            title: _('Warning'),
                            message: _('Two-factor authentication is disabled.'),
                            buttonLabels: [_('OK')]
                        });
                        $('#send-sms-button').prop('disabled', false);
                        break;
                    case "denied":
                        ons.notification.alert({
                            title: _('Warning'),
                            message: _('Invalid password.'),
                            buttonLabels: [_('OK')]
                        });
                        $('#send-sms-button').prop('disabled', false);
                        break;
                    case "ok":
                        ons.notification.toast(_('SMS verification code sent!'), {
                            timeout: 2000
                        });
                        break;
                }
            });
        $('#send-sms-button').prop('disabled', true);
    },
    verificationCodeDisplayMessage: function (message, showProgessBar) {
        $('ons-toolbar-button[component="button/save"]').hide();
        $('#verificationcode-list').hide();

        $('#verificationcode-message').html(message);
        $('#verificationcode-messagecard').show();
        if (showProgessBar) {
            $('#verificationcode-progressbar').show();
        } 
        else {
            $('#verificationcode-progressbar').hide();
        }
    },
    verificationCodeHideMessage: function () {
        if (appNavigator.topPage.data.twofa == undefined || 
            appNavigator.topPage.data.assignedServers == undefined || 
            appNavigator.topPage.data.loadbalancing == undefined) {
            return;
        }

        $('#verificationcode-messagecard').hide();
        $('#verificationcode-progressbar').hide();
        $('ons-toolbar-button[component="button/save"]').show();

        if (appNavigator.topPage.data.askpassword) {
            $('#verificationpassword-list').show();
        }
        if (appNavigator.topPage.data.twofa) {
            $('#verificationcode-list').show();
        }

        if (appNavigator.topPage.data.twofamode == "sms") {
            if (appNavigator.topPage.data.askpassword) {
                $('#send-sms-button').show();
            }
            else {
                tsApp.sendSMSFor2FA();
            }
        }

        if (appNavigator.topPage.data.assignedServers.length >= 2 && appNavigator.topPage.data.loadbalancing == 'off') {
            var assignedServersList = $("#assigned-servers-list");
            assignedServersList.html('');
            var assignedServers = appNavigator.topPage.data.assignedServers;
            for (var i = 0, len = assignedServers.length; i < len; i++) {
                var assignedServer = assignedServers[i].split('|');
                var listItem = ons.createElement(
                    '<ons-list-item tappable modifier="longdivider">' +
                    '<label class="left">' +
                    '<ons-radio name="server-assigned-list" value="' + assignedServer[1] + '" input-id="server-' + (i+1) + '"></ons-radio>' +
                    '</label>' +
                    '<label for="server-' + (i+1) + '" class="center">' + assignedServer[0] + '</label>' +
                    '</ons-list-item>');
    
                assignedServersList.append(listItem);
            }

            $('#server-selection').show();
        }
    },
    areVerificationEntriesFilled: function() {
        if (appNavigator.topPage.data.twofa == true) {
            var codeRegExp = RegExp(/^([0-9]){4,12}$/);
            $('#verificationcode-form-code').val($.trim($('#verificationcode-form-code').val()));

            if ($('#verificationcode-form-code').val() === '' || !codeRegExp.test($('#verificationcode-form-code').val())) {
                ons.notification.alert({
                    title: _('Warning'),
                    message: _('Please enter a valid verification code.'),
                    buttonLabels: [_('OK')]
                });
                $('#verificationcode-form-code').val('');
                return false;
            }
        }

        if (appNavigator.topPage.data.assignedServers.length >= 2) {
            $('ons-radio[name=server-assigned-list] input:checked').each(function() {
                appNavigator.topPage.data.serverhostname = $(this).attr('value');
            });
            if (appNavigator.topPage.data.serverhostname == '') {
                ons.notification.alert({
                    title: _('Warning'),
                    message: _('Please select your server'),
                    buttonLabels: [_('OK')]
                });
                return false;
            }
        }
        return true;
    },

    connect: function () {
        if (!tsApp.areVerificationEntriesFilled()) {
            return false;
        }
        
        if (appNavigator.topPage.data.assignedServers.length == 1) {
            appNavigator.topPage.data.serverhostname = appNavigator.topPage.data.assignedServers[0].split('|')[1];
        }

        appNavigator.pushPage('applications.html', {
            data: {
                serverId: appNavigator.topPage.data.serverId,
                code: $('#verificationcode-form-code').val(),
                passwordTyped: $('#verificationpassword-form-code').val(),
                askPassword: appNavigator.topPage.data.askpassword,
                serverhostname: appNavigator.topPage.data.serverhostname
            }
        });
        return false;
    }
//endregion
};
