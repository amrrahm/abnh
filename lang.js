
var lang = new Array();

function _(key) {
    return tsLanguage.getTranslationFor(key);
}

var tsLanguage = {
    language: 'en',
    setLanguage: function(languageValue) {
        this.language = languageValue.substr(0, 2);
        if (this.language == 'zh') {
            if (languageValue.substr(3, 2) == 'tw') {
                this.language = 'zh-tw';
            } else {
                this.language = 'zh-cn';
            }
        }
        if (!lang[this.language]) {
            this.language = 'en';
        }
    },
    getTranslationFor: function(key) {
        if (lang[this.language][key]) {
            return lang[this.language][key];
        } else if (lang['en'][key]) {
            return lang['en'][key];
        } else {
            return key;
        }
    },
    translateHtmlForCurrentPage: function(page) {
        Array.prototype.forEach.call(page.querySelectorAll('[data-translate]'), function(element) {
            element.innerHTML = _(element.dataset.translate);
        });
        Array.prototype.forEach.call(page.querySelectorAll('[data-translate-placeholder]'), function(element) {
            element.setAttribute('placeholder', _(element.dataset.translatePlaceholder));
        });
    }
}
