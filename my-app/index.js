// dependencys
const fs = require('fs'),
   mustache = require('mustache'),
   inline = require('inline-source'),
   nodemailer = require('nodemailer'),
   htmlToText = require('html-to-text'),
   path = require('path');



// logging
var log = {
   success: console.log,
   info: console.log,
   error: console.error,
   critical: function () {
      throw new Error(console.error.apply(arguments));
   }
};
try { // try using rf-log
   log = require(require.resolve('rf-log')).customPrefixLogger('[simple-template-mailer]');
} catch (e) {}



// options passed when creating an instance
var opts = {};

// json tranlation files will be stored here
var translations = [];



/** create an instance
 *
 * @example
 * var mail = simpleTemplateMailer({
 *  defaultLanguage: 'en',
 *  transporter:  { // nodemailer tramporter options
 *     host: 'smtp.test.mail.address',
 *     requiresAuth: false,
 *  },
 *  translationsPath: __dirname +  "/translations",
 *  templatesPath: __dirname + "/templates",
 * });
 *
 */
module.exports = function (config) {

   config = config || {};

   // housekeeping
   if (!config.transporter) return log.error('no transporter defined, aborting');
   if (!config.translationsPath) return log.error('no translationsPath defined, aborting');
   if (!config.templatesPath) return log.error('no templatesPath defined, aborting');

   // options passed when creating an instance
   opts = {
      defaultLanguage: config.defaultLanguage || 'de',
      transporter: nodemailer.createTransport(config.transporter),
      translationsPath: config.translationsPath || 'translations',
      templatesPath: config.templatesPath || 'templates',
      inlineAttribute: config.inlineAttribute || false,
      translations: config.translations || {}
   };

   // init: read all json translatonFiles and store them in "translations"
   _getTranslations();

   // external methods
   return {
      getTemplate: _getTemplate,
      send: _send
   };
};



// read all json translatonFiles and store them in "translations"
function _getTranslations () {

   // get file names
   var translatonFiles = _getAllFilesFromFolder(opts.translationsPath);
   function _getAllFilesFromFolder (dir) {
      var results = [];
      fs.readdirSync(dir).forEach(function (file) {
         var filePath = dir + '/' + file;
         var stat = fs.statSync(filePath);
         if (stat && stat.isDirectory()) {
            results = results.concat(_getAllFilesFromFolder(filePath));
         } else {
            results.push({
               path: filePath,
               name: file.split('.')[0]
            });
         }
      });
      return results;
   }

   // store file content in "translations"
   translatonFiles.forEach(function (translationFile) {
      try {
         translations[translationFile.name] = JSON.parse(fs.readFileSync(translationFile.path, 'utf8'));
      } catch (err) {
         log.error('Error in json file ' + translationFile.name + ': ' + err);
      }
   });

}



function _getTemplate (template, callback) {

   // housekeeping
   if (!template) {
      log.error('no template defined');
      return callback('no template defined');
   }
   if (!callback) return log.error('no callback defined');
   var langObj, message = {};

   if (template.language && translations[template.language]) {
      langObj = translations[template.language]; // get choosen translation
   } else if (translations && opts.defaultLanguage) {
      log.info('no language found, switching to default');
      langObj = translations[opts.defaultLanguage];
   } else {
      log.info('no language defined');
   }


   // check translations from db
   // if existing, add them to template date
   var lang = template.language || opts.defaultLanguage || 'de';

   if (opts.translations[lang] && langObj) {
      for (var key in opts.translations[lang]) {
         langObj[key] = opts.translations[lang][key];
      }
   }


   // subject: compile with mustache
   if (langObj[template.name]) {
      var htmlSubject = langObj[template.name];
      message.subject = mustache.render( //
         htmlSubject, { // json inserted in "{{ }}"
            data: template.data,
            lang: langObj
         });
   }

   // html message : compile with mustache, then inline extern css/js/img
   var templateDir = opts.templatesPath + '/' + template.name;
   var templatePath = path.join(templateDir, (template.short ? 'template-short.txt' : '/template.html'));

   if (fs.existsSync(templatePath)) { // TODO: fs.existsSync is deprecated
      // compile with mustache
      message.html = mustache.render(
         fs.readFileSync(templatePath, 'utf8'), { // json inserted in "{{ }}"
            data: template.data,
            lang: langObj
         });
   } else { // no template found, instead return the template subject
      message.html = message.subject;
   }


   if (template.short) {
      message.text = message.html;
      return callback(null, message);
   }

   try {

      // only html availale => parse text from html to text
      if (!message.text && message.html) message.text = htmlToText.fromString(message.html, { wordwrap: 130 });

      var inlineAttribute;
      if (template.inlineAttribute || template.inlineAttribute === false) {
         inlineAttribute = template.inlineAttribute;
      } else {
         inlineAttribute = opts.inlineAttribute;
      }

      try { // inline sources (css, images)
         // https://www.npmjs.com/package/inline-source
         inline(message.html, {
            compress: true,
            attribute: inlineAttribute,
            rootpath: templateDir
         }, function (err, html) {

            if (err) {
               log.error('Inline error: ', err);
               return callback(err);
            }
            message.html = html;
            callback(null, message);
         });

      } catch (err) {
         log.error('Inline error: ', err);
         return callback(err);
      }
   } catch (templateErr) {
      return callback(templateErr);
   }

}


function _send (template, message, callback) {

   // housekeeping
   let errMsg = '';
   if (!template) errMsg = 'no template defined';
   if (!message || !message.to) errMsg = 'no template and no options defined for nodemailer';
   if (!callback) errMsg = 'no callback defined';
   if (errMsg) {
      log.error(errMsg);
      return callback(errMsg);
   }


   _getTemplate(template, function (err, mailContent) {

      if (err) {
         log.error('error in getting template: ', err);
         return callback(err);
      }

      message.subject = message.subject || mailContent.subject;
      message.html = message.html || mailContent.html;
      message.text = message.text || mailContent.text;

      // send mail with nodemailer
      // options: https://nodemailer.com/message/
      opts.transporter.sendMail(message,
         function (err, info) {
            if (err) {
               log.error('error in sendMail: ', err);
            } else {
               log.success('successfull sent mail');
            }
            callback(err, info);
         });
   });
}
