using Microsoft.AspNetCore.Mvc;
using System.Text;
using MySite.Web.Services;

namespace MySite.Web.Controllers
{
    [Route("api/chats")]
    public class ChatExportController : Controller
    {
        private readonly IChatStore _store;
        public ChatExportController(IChatStore store) => _store = store;

        // GET /api/chats/{chatId}/export?format=json|csv|txt
        [HttpGet("{chatId}/export")]
        public async Task<IActionResult> Export(string chatId, string format = "txt")
        {
            var msgs = await _store.GetChatAsync(chatId);

            string contentType, ext;
            byte[] bytes;

            switch ((format ?? "txt").ToLowerInvariant())
            {
                case "json":
                    contentType = "application/json";
                    ext = "json";
                    var json = System.Text.Json.JsonSerializer.Serialize(msgs.Where(m => !m.Deleted));
                    bytes = Encoding.UTF8.GetBytes(json);
                    break;

                case "csv":
                    contentType = "text/csv";
                    ext = "csv";
                    var rows = new StringBuilder();
                    rows.AppendLine("id,from,text,ts,deleted");
                    foreach (var m in msgs)
                    {
                        var text = (m.Text ?? "").Replace("\"", "\"\"");
                        rows.AppendLine($"{m.Id},\"{m.From}\",\"{text}\",{m.Ts},{m.Deleted}");
                    }
                    bytes = Encoding.UTF8.GetBytes(rows.ToString());
                    break;

                default:
                    contentType = "text/plain";
                    ext = "txt";
                    var txt = $"Chat export for {chatId} — {DateTime.Now:yyyy-MM-dd HH:mm:ss}\nTotal messages: {msgs.Count}";
                    bytes = Encoding.UTF8.GetBytes(txt);
                    break;
            }

            return File(bytes, contentType, $"chat_{chatId}.{ext}");
        }
    }
}
