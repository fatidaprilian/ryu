module.exports = {
   transporter: { // mail over SMTP
      host: 'smtp.test.mail.address',
      requiresAuth: true,
      tls: {
         rejectUnauthorized: false
      },
      auth: {
         user: 'testUser@Mailadress',
         pass: 'testpassword'
      }
   }
};
