using Microsoft.AspNetCore.Mvc.RazorPages;

namespace MySite.Web.Pages
{
    public class ChatModel : PageModel
    {
        public void OnGet()
        {
            // No data needed for now, chat works via SignalR
        }
    }
}
