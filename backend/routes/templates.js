const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Download consignment template
router.get('/consignment', authenticateToken, (req, res) => {
  const csvContent = `marketplaceSku,internalSku,requiredQty
"B08N5WRWNW","TSHIRT-BLK-M",10
"B08N5M7S6K","TSHIRT-WHT-L",5
"B08N5WRWN1","JEANS-BLU-32",8
"B08N5M7S62","HOODIE-GRY-M",12
"B08N5WRWN3","SHIRT-WHT-L",7
`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sku_template.csv"');
  res.send(csvContent);
});

module.exports = router;
