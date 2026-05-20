/**
 * Import FAQ hàn/trám răng (bán hàng + chuyên môn) → knowledge-rang-su-faq.json
 * ID: HANRANG-001 … (theo STT nguồn; STT 23 không có trong bảng gốc)
 * Chỉ cập nhật han-rang-faq-import-source.txt: node merge-han-rang-faq.mjs --emit-source-only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const sourcePath = path.join(dataDir, 'han-rang-faq-import-source.txt');
const targetPath = path.join(dataDir, 'knowledge-rang-su-faq.json');

/** @type {{ stt: number; sales: string; expert: string; answer: string }[]} */
const ROWS = [
  {
    stt: 1,
    sales: 'Hàn răng bên mình giá bao nhiêu một răng?',
    expert: '',
    answer:
      'Chi phí hàn răng ở Singae sẽ tùy mức độ sâu và vị trí răng. Anh/chị qua kiểm tra là bên em báo đúng giá cho mình.',
  },
  {
    stt: 2,
    sales: 'Nếu hôm nay bận quá thì hàn răng có làm nhanh được không?',
    expert: '',
    answer:
      'Bên em sắp xếp linh hoạt theo lịch của mình, bác sĩ thao tác nhẹ nhàng, nhanh gọn nhưng vẫn đảm bảo kỹ thuật và độ bền lâu dài. Anh/chị chỉ cần ghé qua, bên em sẽ hỗ trợ kiểm tra và làm ngay để mình không mất nhiều thời gian ạ.',
  },
  {
    stt: 3,
    sales: 'Nếu chưa mang đủ tiền thì có cần làm luôn không?',
    expert: '',
    answer:
      'Dạ, nếu hôm nay mình chưa chuẩn bị đủ kinh phí thì anh/chị vẫn có thể qua kiểm tra trước hoàn toàn được ạ. Bác sĩ sẽ thăm khám kỹ để đánh giá mức độ sâu và tư vấn hướng xử lý phù hợp cho mình.',
  },
  {
    stt: 4,
    sales: 'Hàn răng có bảo hành không?',
    expert: '',
    answer:
      'Bên em luôn có quy trình theo dõi sát sao sau điều trị để đảm bảo kết quả ổn định và khách hàng hoàn toàn yên tâm.\nRiêng với dịch vụ hàn răng, Singae áp dụng chính sách bảo hành 3 tháng, trong thời gian này nếu có bất kỳ vấn đề phát sinh, bên em sẽ kiểm tra và xử lý lại hoàn toàn miễn phí.\nAnh/chị có thể yên tâm qua trực tiếp để bác sĩ thăm khám kỹ và tư vấn phương án phù hợp nhất với tình trạng răng của mình ạ.',
  },
  {
    stt: 5,
    sales: 'Tại sao giá hàn răng bên mình khác chỗ khác?',
    expert: '',
    answer:
      'Dạ, chi phí hàn răng giữa các nơi thường khác nhau chủ yếu nằm ở chất lượng vật liệu, quy trình xử lý mô sâu và tay nghề – mức độ tỉ mỉ của bác sĩ ạ.\nTại Singae, bên em ưu tiên làm sạch kỹ phần sâu, sử dụng vật liệu tốt và thực hiện đúng chuẩn để miếng hàn bền chắc, hạn chế tái sâu và giữ răng thật lâu dài cho mình.\nAnh/chị có thể qua để bác sĩ kiểm tra trực tiếp, tư vấn rõ ràng từng phương án để mình yên tâm lựa chọn phù hợp nhất ạ.',
  },
  {
    stt: 6,
    sales: '',
    expert: 'Hàn răng là gì?',
    answer:
      'Hàn răng, hay còn gọi là trám răng, là phương pháp trám vật liệu nha khoa vào chỗ răng bị sâu, bị mẻ, bị thưa, bị mòn để phục hồi lại hình dạng và chức năng của răng.',
  },
  {
    stt: 7,
    sales: '',
    expert: 'Đối tượng nào cần hàn răng?',
    answer: `Dưới đây là những đối tượng chính cần hàn răng:
1. Sâu răng
Đây là đối tượng phổ biến nhất. Khi răng xuất hiện các lỗ đen, lỗ hổng do vi khuẩn tấn công, việc hàn răng giúp loại bỏ ổ vi khuẩn và ngăn chặn sâu răng ăn sâu vào tủy gây đau nhức hoặc mất răng.
2. Mòn cổ/chân răng
Những người có thói quen đánh răng quá mạnh hoặc dùng bàn chải cứng thường bị khuyết một hình chữ V ở cổ răng gần nướu. Hàn răng giúp che phủ phần ngà răng bị hở, giảm cảm giác ê buốt khi ăn đồ nóng, lạnh.
3. Răng bị mẻ, vỡ nhẹ
Do tai nạn, va đập hoặc thói quen nhai đồ quá cứng khiến răng bị sứt mẻ. Nếu vết mẻ không quá lớn (chưa vào đến tủy), bác sĩ sẽ dùng vật liệu hàn để tái tạo lại hình dáng ban đầu của răng.
4. Răng thưa nhẹ
Với những kẽ hở nhỏ giữa các răng cửa gây mất thẩm mỹ hoặc dễ giắt thức ăn, hàn thẩm mỹ (thường dùng Composite) là giải pháp nhanh chóng và tiết kiệm để đóng kín kẽ thưa.
5. Thay thế miếng trám cũ
Những người đã từng hàn răng nhưng miếng trám cũ bị bong tróc, nứt vỡ hoặc bị đổi màu theo thời gian cũng cần phải hàn lại để đảm bảo chức năng nhai và tính thẩm mỹ.`,
  },
  {
    stt: 8,
    sales: '',
    expert: 'Hàn răng có đau không?',
    answer:
      'Hàn răng thường không đau. Đối với những trường hợp sâu răng lớn, lỗ sâu sát tuỷ, răng nhạy cảm có thể sẽ thấy ê buốt khi bác sĩ làm sạch lỗ sâu.',
  },
  {
    stt: 9,
    sales: '',
    expert: 'Hàn răng có cần gây tê không?',
    answer:
      'Đa số các trường hợp hàn răng không cần gây tê. Tuy nhiên, nếu lỗ sâu lớn, sâu gần đến tủy hoặc răng quá nhạy cảm, bác sĩ sẽ gây tê để đảm bảo bạn hoàn toàn thoải mái trong suốt quá trình thực hiện.',
  },
  {
    stt: 10,
    sales: '',
    expert: 'Quy trình hàn răng như thế nào?',
    answer: `Quy trình chuẩn thường gồm 4 bước:
• Bước 1: Khám và xác định vị trí răng cần hàn.
• Bước 2: Làm sạch lỗ sâu / vị trí trám, sửa soạn xoang trám.
• Bước 3: Dùng vật liệu hàn (như Composite/Fuji) tái tạo lại hình thể răng.
• Bước 4: Chiếu đèn laser để làm cứng vật liệu và đánh bóng để răng tự nhiên nhất.`,
  },
  {
    stt: 11,
    sales: '',
    expert: 'Hàn răng có bền không?',
    answer:
      'Độ bền của mối hàn phụ thuộc vào vật liệu và cách chăm sóc. Nếu chăm sóc tốt và không ăn đồ quá cứng, mối hàn sẽ rất bền chắc.',
  },
  {
    stt: 12,
    sales: '',
    expert: 'Hàn răng mất bao lâu?',
    answer:
      'Thời gian thực hiện rất nhanh, trung bình chỉ mất từ 15 đến 30 phút cho một vị trí hàn, tùy vào mức độ phức tạp của vị trí hàn.',
  },
  {
    stt: 13,
    sales: '',
    expert: 'Hàn răng có hại gì cho sức khỏe không?',
    answer:
      'Hàn răng hoàn toàn không có hại. Ngược lại, nó giúp bảo vệ răng thật, ngăn chặn vi khuẩn xâm lấn sâu hơn gây viêm tủy hay mất răng. Các vật liệu nha khoa hiện đại ngày nay rất an toàn và tương thích tốt với cơ thể.',
  },
  {
    stt: 14,
    sales: '',
    expert: 'Chăm sóc răng thế nào để tránh sâu răng?',
    answer: `Để tránh sâu răng, bạn nên:
• Đánh răng ít nhất 2 lần/ngày với kem đánh răng chứa Fluoride.
• Sử dụng chỉ nha khoa hoặc máy tăm nước sau mỗi bữa ăn.
• Hạn chế đồ ngọt, nước có ga và đồ ăn vặt ban đêm.
• Khám răng và lấy cao răng định kỳ 6 tháng/lần.`,
  },
  {
    stt: 15,
    sales: 'Nếu sâu răng nhẹ thì hàn luôn được không?',
    expert: '',
    answer:
      'Nhiều trường hợp sâu nhẹ có thể làm luôn trong buổi khám. Bác sĩ sẽ kiểm tra rồi xử lý cho mình phù hợp.',
  },
  {
    stt: 16,
    sales: 'Hàn răng bên mình mất khoảng bao lâu một cái?',
    expert: '',
    answer:
      'Thông thường, thời gian hàn răng diễn ra khá nhanh, chỉ khoảng 5–10 phút cho mỗi răng, tùy theo mức độ sâu và vị trí răng của mình.\nBác sĩ sẽ thao tác nhẹ nhàng, chính xác nên anh/chị gần như không mất nhiều thời gian mà vẫn đảm bảo hiệu quả và thẩm mỹ.\nAnh/chị có thể qua trực tiếp để được kiểm tra và xử lý sớm, tránh để tình trạng sâu tiến triển nặng hơn ạ.',
  },
  {
    stt: 17,
    sales: '',
    expert: 'Hàn răng xong có phải kiêng ăn không?',
    answer:
      'Hàn răng xong nên kiêng ăn trong khoảng 1–2 tiếng đầu để miếng trám đông cứng hoàn toàn và bám chắc vào răng, tránh tình trạng bong tróc. Trong thời gian này, nên ưu tiên thức ăn mềm, nguội, hạn chế đồ cứng, dai, quá nóng hoặc quá lạnh.',
  },
  {
    stt: 18,
    sales: '',
    expert: 'Miếng hàn có bị rơi ra không?',
    answer:
      'Miếng hàn (trám) răng có thể bị rơi, nứt hoặc vỡ sau một thời gian sử dụng. Nguyên nhân thường do ăn đồ quá cứng/dai hoặc miếng trám đã quá cũ (sau 3–5 năm). Nếu miếng trám bị rớt, bạn nên đến nha khoa để được kiểm tra và trám lại.',
  },
  {
    stt: 19,
    sales: '',
    expert: 'Răng sâu vào tủy rồi có hàn được nữa không?',
    answer:
      'Khi lỗ sâu vào đến tuỷ, hệ thống ống tuỷ của răng đã nhiễm khuẩn, bị viêm hoặc chết tuỷ tuỳ từng trường hợp cụ thể. Chính vì vậy, răng cần được điều trị tuỷ trước, sau đó mới đến bước hàn trám phần thân răng.',
  },
  {
    stt: 20,
    sales: '',
    expert: 'Răng cửa mẻ nhỏ có hàn thẩm mỹ được không?',
    answer:
      'Với răng cửa mẻ nhỏ, có thể hàn thẩm mỹ. Tuy nhiên, bác sĩ sẽ còn cần thăm khám kiểm tra thêm về vị trí mẻ, khớp cắn và một số yếu tố liên quan khác để tư vấn cho bạn về độ bền và thẩm mỹ của miếng trám.',
  },
  {
    stt: 21,
    sales: 'Hàn răng xong có bị đổi màu không?',
    expert: '',
    answer:
      'Hàn răng có thể bị đổi màu theo thời gian, đặc biệt là với các vật liệu composite sau vài năm sử dụng. Nguyên nhân thường do nhiễm màu thực phẩm, vệ sinh kém, hoặc do vật liệu trám bị lão hóa/vỡ. Miếng trám có thể chuyển sang màu sẫm hơn, xám hoặc đen so với màu răng tự nhiên.',
  },
  {
    stt: 22,
    sales: 'Nếu không hàn sớm thì sâu răng có nặng lên nhanh không?',
    expert: '',
    answer:
      'Dạ, sâu răng có thể tiến triển nhanh hơn mình nghĩ, đặc biệt khi lỗ sâu đã bắt đầu giắt thức ăn thì vi khuẩn sẽ phát triển mạnh và làm răng yếu đi từng ngày ạ.\nNếu mình xử lý sớm, việc hàn răng sẽ rất nhẹ nhàng, nhanh chóng và chi phí cũng tối ưu hơn nhiều.\nAnh/chị nên qua sớm để bác sĩ kiểm tra và xử lý kịp thời, vừa giữ được răng thật, vừa tránh những can thiệp phức tạp về sau ạ.',
  },
  {
    stt: 24,
    sales: 'Nếu răng sâu nhỏ có cần hàn không?',
    expert: '',
    answer:
      'Dạ, ngay cả khi răng sâu còn nhỏ thì mình vẫn nên kiểm tra sớm ạ. Ở giai đoạn này, việc hàn sẽ rất nhẹ nhàng, gần như không khó chịu và giúp ngăn sâu răng lan rộng hơn.\nNếu để lâu, lỗ sâu có thể tiến triển nhanh vào phần sâu bên trong, khi đó điều trị sẽ phức tạp và tốn kém hơn nhiều. Anh/chị qua sớm để bác sĩ kiểm tra và xử lý kịp thời sẽ giữ được răng chắc khỏe lâu dài ạ.',
  },
  {
    stt: 25,
    sales: 'Hàn răng có mất nhiều thời gian không?',
    expert: '',
    answer:
      'Bác sĩ sẽ thực hiện nhẹ nhàng, chuẩn xác nên anh/chị không cần lo mất nhiều thời gian. Chỉ cần sắp xếp ghé qua là có thể kiểm tra và xử lý nhanh gọn, giúp răng được bảo vệ sớm và tránh phát sinh vấn đề về sau ạ.',
  },
  {
    stt: 26,
    sales: 'Sau khi hàn răng có cần kiêng ăn không?',
    expert: '',
    answer:
      'Dạ, sau khi hàn răng mình không cần kiêng khem quá nhiều đâu ạ. Thông thường bác sĩ sẽ dặn anh/chị tránh ăn đồ quá cứng hoặc dai trong thời gian đầu để miếng hàn ổn định tốt hơn.\nNgoài ra mình vẫn sinh hoạt và ăn uống bình thường. Bác sĩ sẽ hướng dẫn rất cụ thể sau khi làm để anh/chị yên tâm chăm sóc tại nhà. Anh/chị có thể qua kiểm tra và làm sớm để xử lý nhẹ nhàng, không ảnh hưởng sinh hoạt ạ.',
  },
  {
    stt: 27,
    sales: 'Hàn răng có bền không?',
    expert: '',
    answer:
      'Dạ, hàn răng nếu được làm đúng kỹ thuật và chăm sóc tốt thì độ bền khá cao, có thể sử dụng ổn định trong thời gian dài ạ.\nĐộ bền sẽ phụ thuộc vào vị trí răng, mức độ sâu ban đầu và cách mình chăm sóc sau khi làm. Tại Singae, bác sĩ xử lý sạch mô sâu và làm rất kỹ nên giúp miếng hàn bám chắc, hạn chế bong hoặc tái sâu.\nAnh/chị có thể qua để bác sĩ kiểm tra cụ thể tình trạng răng và tư vấn phương án phù hợp nhất, đảm bảo vừa bền vừa an toàn cho mình ạ.',
  },
];

function emitTsv() {
  const header =
    'STT\tCác câu hỏi của khách hàng về bán hàng\tCác câu hỏi của khách hàng về chuyên môn\tCâu trả lời cho những câu hỏi liên quan tới vấn đề bán hàng';
  const parts = [header];
  for (const r of ROWS) {
    const ansLines = r.answer.split('\n');
    parts.push(`${r.stt}\t${r.sales}\t${r.expert}\t${ansLines[0] ?? ''}`);
    for (let i = 1; i < ansLines.length; i++) {
      parts.push(ansLines[i]);
    }
  }
  fs.writeFileSync(sourcePath, parts.join('\n') + '\n', 'utf8');
}

function main() {
  const emitSourceOnly = process.argv.includes('--emit-source-only');
  emitTsv();
  if (emitSourceOnly) {
    console.log('Wrote', sourcePath, '(JSON unchanged, --emit-source-only)');
    return;
  }

  const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  if (data.some((item) => String(item.id).startsWith('HANRANG-'))) {
    console.error('Refusing to run: HANRANG-* entries already exist.');
    process.exit(1);
  }

  for (const row of ROWS) {
    const question = row.sales || row.expert;
    if (!question) continue;
    data.push({
      id: `HANRANG-${String(row.stt).padStart(3, '0')}`,
      category: 'Han rang',
      question,
      answer: row.answer.trim(),
      keywords: `han rang;tram rang;sales;hanrang-${String(row.stt).padStart(3, '0')}`,
      conditions: '',
      channel_scope: 'all',
      priority: 4,
      effective_from: '2026-01-01',
      effective_to: '',
      status: 'active',
    });
  }

  fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('Wrote', sourcePath);
  console.log('Appended', ROWS.length, 'HANRANG entries (STT 23 absent in source).');
}

main();
