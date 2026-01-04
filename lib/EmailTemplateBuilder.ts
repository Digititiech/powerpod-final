
export const generateEmailHtml = (data: {
  merchantName: string;
  contactName: string;
  companyName: string;
  periods: string[];
  periodDetails: Array<{
    period: string;
    totalSales: string;
    totalTax: string;
    totalStripe: string;
    net: string;
    share: string;
  }>;
  totalSales: string;
  totalPayout: string;
  contractType: string;
  revenueShare: string;
  remittanceNote?: string;
}) => {
  const rows = data.periodDetails.map(p => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">${p.period}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">${p.totalSales}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">${p.totalTax}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">${p.totalStripe}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">${p.net}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right; color: #E67E22; font-weight: bold;">${p.share}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      
      <!-- Header -->
      <div style="background-color: #181340; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">PowerPod Monthly Sales Report</h1>
      </div>

      <div style="padding: 30px;">
        <p style="font-size: 16px; color: #333;">Dear ${data.contactName || data.merchantName},</p>
        <p style="font-size: 14px; color: #555; line-height: 1.5;">Please find your PowerPod sales report summary for <strong>${data.companyName}</strong> covering periods: <strong>${data.periods.join(', ')}</strong>.</p>

        <!-- Table -->
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd; color: #555;">Period</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd; color: #555;">Total Sales</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd; color: #555;">Tax</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd; color: #555;">Stripe</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd; color: #555;">Net</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #ddd; color: #181340;">Your Share</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <!-- Summary -->
        <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px; border-left: 5px solid #181340;">
          <h3 style="margin: 0 0 15px 0; color: #181340; font-size: 18px;">Summary Totals</h3>
          <p style="margin: 5px 0; font-size: 14px; color: #555;">Total Sales: <strong style="color: #333;">${data.totalSales}</strong></p>
          <p style="margin: 5px 0; font-size: 14px; color: #555;">Total Payable to You: <strong style="color: #E67E22; font-size: 18px;">${data.totalPayout}</strong></p>
        </div>

        ${data.remittanceNote ? `
        <div style="margin-top: 20px; background-color: #fff3cd; padding: 15px; border-radius: 8px; border-left: 5px solid #ffc107;">
          <h4 style="margin: 0 0 5px 0; color: #856404; font-size: 14px;">Remittance Note:</h4>
          <p style="margin: 0; color: #555; font-style: italic;">${data.remittanceNote}</p>
        </div>
        ` : ''}

        <!-- Button -->
        <div style="text-align: center; margin-top: 30px;">
          <a href="#" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 14px; display: inline-block;">Download Full PDF Report</a>
          <p style="font-size: 11px; color: #999; margin-top: 10px;">(Full detailed report attached to this email)</p>
        </div>

        <div style="margin-top: 40px; border-top: 1px solid #e0e0e0; padding-top: 20px; font-size: 12px; color: #888; text-align: center;">
          <p>For inquiries, contact <a href="mailto:finance@powerpod.ae" style="color: #007bff; text-decoration: none;">finance@powerpod.ae</a></p>
          <p>Powerpod Vending | www.powerpod.ae</p>
        </div>
      </div>
    </div>
  `;
};
